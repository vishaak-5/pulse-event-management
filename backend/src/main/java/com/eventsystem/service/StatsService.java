package com.eventsystem.service;

import com.eventsystem.dto.StatsDtos.*;
import com.eventsystem.model.*;
import com.eventsystem.repository.*;
import com.eventsystem.security.AuthUser;
import com.eventsystem.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class StatsService {

    private final EventRepository events;
    private final UserRepository users;
    private final RegistrationRepository registrations;
    private final FeedbackRepository feedback;
    private final AttendanceForecaster forecaster;

    public StatsService(EventRepository events, UserRepository users, RegistrationRepository registrations,
                        FeedbackRepository feedback, AttendanceForecaster forecaster) {
        this.events = events;
        this.users = users;
        this.registrations = registrations;
        this.feedback = feedback;
        this.forecaster = forecaster;
    }

    @Transactional(readOnly = true)
    public EventAnalytics forEvent(Long eventId, AuthUser actor) {
        Event e = events.findById(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        EventService.requireManage(e, actor);

        List<Registration> regs = registrations.findByEvent(eventId);
        long confirmed = count(regs, RegistrationStatus.CONFIRMED);
        long checkedIn = count(regs, RegistrationStatus.CHECKED_IN);
        long waitlisted = count(regs, RegistrationStatus.WAITLISTED);
        long cancelled = count(regs, RegistrationStatus.CANCELLED);
        long seated = confirmed + checkedIn;

        // Daily sign-ups from the first registration up to today (or the event day), zero-filled.
        TreeMap<LocalDate, Long> byDay = new TreeMap<>();
        for (Registration r : regs) {
            byDay.merge(r.getCreatedAt().toLocalDate(), 1L, Long::sum);
        }
        List<DayCount> series = new ArrayList<>();
        if (!byDay.isEmpty()) {
            LocalDate end = LocalDate.now().isBefore(e.getStartAt().toLocalDate())
                    ? LocalDate.now() : e.getStartAt().toLocalDate();
            if (end.isBefore(byDay.lastKey())) {
                end = byDay.lastKey();
            }
            for (LocalDate d = byDay.firstKey(); !d.isAfter(end); d = d.plusDays(1)) {
                series.add(new DayCount(d, byDay.getOrDefault(d, 0L)));
            }
        }

        Map<Integer, Long> distribution = new LinkedHashMap<>();
        for (int star = 5; star >= 1; star--) {
            distribution.put(star, 0L);
        }
        feedback.findByEvent(eventId).forEach(f -> distribution.merge(f.getRating(), 1L, Long::sum));

        // Turnout forecast: people already checked in count fully, the rest by their show-up estimate.
        List<Registration> seatHolders = regs.stream().filter(Registration::holdsSeat).toList();
        var estimates = forecaster.estimate(eventId, seatHolders);
        double expected = 0;
        for (Registration r : seatHolders) {
            expected += r.getStatus() == RegistrationStatus.CHECKED_IN
                    ? 1.0 : estimates.get(r.getUser().getId()).showRate();
        }
        int noShows = (int) Math.round(seated - expected);
        // Only suggest releasing seats while that can still help someone on the waitlist.
        boolean upcoming = e.getStatus() == EventStatus.APPROVED && e.getStartAt().isAfter(LocalDateTime.now());
        int extraSeats = upcoming && e.getReleasedSeats() == 0
                ? (int) Math.min(Math.floor(seated - expected), waitlisted) : 0;

        return new EventAnalytics(e.getId(), e.getTitle(), e.getCapacity(), confirmed, checkedIn, waitlisted,
                cancelled,
                e.getCapacity() == 0 ? 0 : (double) seated / e.getCapacity(),
                seated == 0 ? 0 : (double) checkedIn / seated,
                feedback.averageRating(eventId), feedback.countByEventId(eventId), distribution, series,
                expected, Math.max(0, noShows), Math.max(0, extraSeats), e.getReleasedSeats());
    }

    @Transactional(readOnly = true)
    public OrganizerOverview overview(AuthUser organizer) {
        List<Event> mine = events.findByOrganizer(organizer.id());
        LocalDateTime now = LocalDateTime.now();
        long upcoming = mine.stream()
                .filter(e -> e.getStatus() == EventStatus.APPROVED && e.getEndAt().isAfter(now)).count();
        long pending = mine.stream().filter(e -> e.getStatus() == EventStatus.PENDING).count();
        long totalRegs = 0;
        long totalCheckedIn = 0;
        double ratingSum = 0;
        long ratingCount = 0;
        for (Event e : mine) {
            totalRegs += registrations.countByEventIdAndStatusIn(e.getId(), EventService.SEAT_HOLDING);
            totalCheckedIn += registrations.countByEventIdAndStatus(e.getId(), RegistrationStatus.CHECKED_IN);
            long n = feedback.countByEventId(e.getId());
            if (n > 0) {
                ratingSum += feedback.averageRating(e.getId()) * n;
                ratingCount += n;
            }
        }
        return new OrganizerOverview(mine.size(), upcoming, pending, totalRegs, totalCheckedIn,
                ratingCount == 0 ? null : ratingSum / ratingCount);
    }

    @Transactional(readOnly = true)
    public AdminStats admin() {
        Map<String, Long> byRole = new LinkedHashMap<>();
        for (Role r : Role.values()) {
            byRole.put(r.name(), users.countByRole(r));
        }
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (EventStatus s : EventStatus.values()) {
            byStatus.put(s.name(), events.countByStatus(s));
        }
        return new AdminStats(byRole, byStatus,
                registrations.countByStatusIn(EventService.SEAT_HOLDING),
                registrations.countByStatusIn(EnumSet.of(RegistrationStatus.CHECKED_IN)));
    }

    @Transactional(readOnly = true)
    public PublicStats publicStats() {
        long upcoming = events.searchPublic(null, null, false, LocalDateTime.now()).size();
        return new PublicStats(upcoming, users.countByRole(Role.ATTENDEE), users.countByRole(Role.ORGANIZER),
                registrations.countByStatusIn(EventService.SEAT_HOLDING));
    }

    private static long count(List<Registration> regs, RegistrationStatus status) {
        return regs.stream().filter(r -> r.getStatus() == status).count();
    }
}
