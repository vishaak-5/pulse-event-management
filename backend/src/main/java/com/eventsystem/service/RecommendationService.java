package com.eventsystem.service;

import com.eventsystem.dto.EventDtos.EventView;
import com.eventsystem.dto.StatsDtos.Recommendation;
import com.eventsystem.model.Category;
import com.eventsystem.model.Event;
import com.eventsystem.model.Feedback;
import com.eventsystem.model.Registration;
import com.eventsystem.repository.EventRepository;
import com.eventsystem.repository.FeedbackRepository;
import com.eventsystem.repository.RegistrationRepository;
import com.eventsystem.security.AuthUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

/**
 * "Picked for you": ranks upcoming events an attendee has not joined yet.
 *
 *   score = 2.0 x category affinity      (events booked in that category, plus
 *                                          +1.5 per 4-5 star rating, -1 per 1-2 star rating)
 *         + 1.5 x popularity             (share of seats already taken)
 *         + 1.0 / 0.5 if within 7 / 14 days
 *         - 1.0 if the event is full (only the waitlist is open)
 *
 * Every pick carries a one-line reason built from the strongest signal,
 * so the suggestion is explainable rather than a black box.
 */
@Service
public class RecommendationService {

    private static final int LIMIT = 3;

    private final EventRepository events;
    private final RegistrationRepository registrations;
    private final FeedbackRepository feedback;
    private final EventService eventService;

    public RecommendationService(EventRepository events, RegistrationRepository registrations,
                                 FeedbackRepository feedback, EventService eventService) {
        this.events = events;
        this.registrations = registrations;
        this.feedback = feedback;
        this.eventService = eventService;
    }

    @Transactional(readOnly = true)
    public List<Recommendation> forAttendee(AuthUser attendee) {
        LocalDateTime now = LocalDateTime.now();

        Map<Category, Double> affinity = new EnumMap<>(Category.class);
        Map<Category, Integer> booked = new EnumMap<>(Category.class);
        Set<Long> joined = new HashSet<>();
        for (Registration r : registrations.findActiveByUser(attendee.id())) {
            joined.add(r.getEvent().getId());
            affinity.merge(r.getEvent().getCategory(), 1.0, Double::sum);
            booked.merge(r.getEvent().getCategory(), 1, Integer::sum);
        }
        Map<Category, Integer> lovedRatings = new EnumMap<>(Category.class);
        for (Feedback f : feedback.findByUser(attendee.id())) {
            Category c = f.getEvent().getCategory();
            if (f.getRating() >= 4) {
                affinity.merge(c, 1.5, Double::sum);
                lovedRatings.merge(c, 1, Integer::sum);
            } else if (f.getRating() <= 2) {
                affinity.merge(c, -1.0, Double::sum);
            }
        }

        List<Recommendation> picks = new ArrayList<>();
        for (Event e : events.searchPublic(null, null, false, now)) {
            if (joined.contains(e.getId())) {
                continue;
            }
            EventView v = eventService.view(e);
            double aff = affinity.getOrDefault(e.getCategory(), 0.0);
            double popularity = e.getCapacity() == 0 ? 0 : (double) v.seatsTaken() / e.getCapacity();
            long days = Math.max(0, Duration.between(now, e.getStartAt()).toDays());
            double soon = days <= 7 ? 1.0 : days <= 14 ? 0.5 : 0;
            double score = 2.0 * aff + 1.5 * popularity + soon - (v.seatsLeft() == 0 ? 1.0 : 0);
            picks.add(new Recommendation(v, reason(e, aff, booked, lovedRatings, popularity, days), score));
        }
        picks.sort(Comparator.comparingDouble(Recommendation::score).reversed());
        return picks.subList(0, Math.min(LIMIT, picks.size()));
    }

    private static String reason(Event e, double aff, Map<Category, Integer> booked,
                                 Map<Category, Integer> loved, double popularity, long days) {
        String cat = e.getCategory().name().toLowerCase();
        if (aff > 0 && loved.getOrDefault(e.getCategory(), 0) > 0) {
            return "You rated a " + cat + " event highly";
        }
        if (aff > 0) {
            int n = booked.getOrDefault(e.getCategory(), 0);
            return "You've booked " + n + " " + cat + " event" + (n == 1 ? "" : "s");
        }
        if (popularity >= 0.5) {
            return Math.round(popularity * 100) + "% of seats already taken";
        }
        if (days <= 7) {
            return days == 0 ? "Happening today" : days == 1 ? "Happening tomorrow" : "Happening in " + days + " days";
        }
        return "New in " + cat;
    }
}
