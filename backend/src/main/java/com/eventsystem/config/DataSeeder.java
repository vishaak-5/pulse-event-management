package com.eventsystem.config;

import com.eventsystem.model.*;
import com.eventsystem.repository.EventRepository;
import com.eventsystem.repository.FeedbackRepository;
import com.eventsystem.repository.RegistrationRepository;
import com.eventsystem.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Fills an empty database with demo accounts, events, registrations and
 * feedback so every dashboard has something to show. Runs only when the
 * users table is empty and app.seed.enabled=true.
 */
@Component
public class DataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final UserRepository users;
    private final EventRepository events;
    private final RegistrationRepository registrations;
    private final FeedbackRepository feedback;
    private final PasswordEncoder encoder;
    private final boolean enabled;
    private final String demoPassword;

    public DataSeeder(UserRepository users, EventRepository events, RegistrationRepository registrations,
                      FeedbackRepository feedback, PasswordEncoder encoder,
                      @Value("${app.seed.enabled}") boolean enabled,
                      @Value("${app.seed.password}") String demoPassword) {
        this.users = users;
        this.events = events;
        this.registrations = registrations;
        this.feedback = feedback;
        this.encoder = encoder;
        this.enabled = enabled;
        this.demoPassword = demoPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled || users.count() > 0) {
            return;
        }
        String hash = encoder.encode(demoPassword);

        users.save(new User("Admin", "admin@pulse.local", hash, Role.ADMIN));
        User org = users.save(new User("Priya Organizer", "organizer@pulse.local", hash, Role.ORGANIZER));
        User org2 = users.save(new User("Arjun Events Club", "club@pulse.local", hash, Role.ORGANIZER));
        User demo = users.save(new User("Demo Attendee", "attendee@pulse.local", hash, Role.ATTENDEE));
        List<User> crowd = new ArrayList<>();
        String[] names = {"Kavya", "Rahul", "Sneha", "Vikram", "Ananya", "Karthik", "Meera", "Rohan"};
        for (String n : names) {
            crowd.add(users.save(new User(n, n.toLowerCase() + "@pulse.local", hash, Role.ATTENDEE)));
        }

        LocalDate today = LocalDate.now();

        Event hack = event(org, "Build Night: 24h Hackathon", Category.TECH, "Innovation Lab, Block C",
                today.plusDays(6), LocalTime.of(9, 0), 24, 120, EventStatus.APPROVED,
                "Teams of up to four build anything that ships in 24 hours. Mentors on the floor all night, "
                        + "food every four hours, and demos judged by alumni from product teams.");
        Event music = event(org2, "Neon Courtyard: Live Indie Night", Category.MUSIC, "Open Air Theatre",
                today.plusDays(10), LocalTime.of(18, 30), 4, 300, EventStatus.APPROVED,
                "Five campus bands, one stage, and a light show built by the media club. Bring friends.");
        Event workshop = event(org, "Hands-on: Spring Boot + React in a Day", Category.WORKSHOP, "Seminar Hall 2",
                today.plusDays(3), LocalTime.of(10, 0), 6, 3, EventStatus.APPROVED,
                "Build and deploy a full-stack app from scratch. Laptops required. Seats are deliberately limited.");
        event(org2, "Inter-College Football Cup", Category.SPORTS, "Main Ground",
                today.plusDays(14), LocalTime.of(7, 30), 10, 500, EventStatus.APPROVED,
                "Sixteen colleges, knockout format, finals under the floodlights.");
        event(org, "Founders' Fireside: Zero to First Customer", Category.BUSINESS, "Auditorium",
                today.plusDays(20), LocalTime.of(16, 0), 2, 200, EventStatus.PENDING,
                "Three student founders on finding their first paying customers. Q&A afterwards.");
        Event past = event(org, "Design Systems Meetup", Category.TECH, "Seminar Hall 1",
                today.minusDays(2), LocalTime.of(15, 0), 3, 40, EventStatus.APPROVED,
                "Talks on tokens, motion and accessibility, followed by a portfolio review.");

        // Workshop: 3 seats, all taken, plus a waitlist - shows the waitlist flow.
        // Seats went to people with a history of skipping events, so the turnout
        // forecast suggests releasing a seat to the waitlist.
        seat(workshop, crowd.get(5), RegistrationStatus.CONFIRMED, 5);
        seat(workshop, crowd.get(6), RegistrationStatus.CONFIRMED, 4);
        seat(workshop, crowd.get(7), RegistrationStatus.CONFIRMED, 4);
        seat(workshop, crowd.get(0), RegistrationStatus.WAITLISTED, 2);
        seat(workshop, crowd.get(1), RegistrationStatus.WAITLISTED, 1);

        event(org2, "Open Source Saturday: First PR Sprint", Category.TECH, "Lab 4, CSE Block",
                today.plusDays(8), LocalTime.of(10, 0), 5, 60, EventStatus.APPROVED,
                "Pick a beginner-friendly issue, pair with a maintainer, and ship your first pull request by lunch.");

        // A second past event with real no-shows: history for the turnout forecast.
        Event walk = event(org2, "Campus Photo Walk", Category.CULTURAL, "Main Gate",
                today.minusDays(12), LocalTime.of(7, 0), 2, 30, EventStatus.APPROVED,
                "Golden-hour walk across campus with the photography club.");
        for (int i : new int[]{0, 1, 3}) {
            Registration r = seat(walk, crowd.get(i), RegistrationStatus.CHECKED_IN, 16);
            r.setCheckedInAt(walk.getStartAt().plusMinutes(4L * i));
        }
        for (int i : new int[]{5, 6, 7}) {
            seat(walk, crowd.get(i), RegistrationStatus.CONFIRMED, 15);
        }

        // Hackathon and music night: spread-out sign-ups for the analytics chart.
        for (int i = 0; i < crowd.size(); i++) {
            seat(hack, crowd.get(i), RegistrationStatus.CONFIRMED, 9 - i);
        }
        seat(hack, demo, RegistrationStatus.CONFIRMED, 2);
        for (int i = 2; i < crowd.size(); i++) {
            seat(music, crowd.get(i), RegistrationStatus.CONFIRMED, 7 - i / 2);
        }

        // Past meetup: check-ins and ratings.
        int[] ratings = {5, 4, 5, 3, 4, 5};
        String[] comments = {"Loved the motion talk!", "Great speakers, room was a bit warm.", "Super useful.",
                null, "Would come again.", "Best meetup this semester."};
        for (int i = 0; i < ratings.length; i++) {
            Registration r = seat(past, crowd.get(i), RegistrationStatus.CHECKED_IN, 10 - i);
            r.setCheckedInAt(past.getStartAt().plusMinutes(5L * i));
            Feedback f = new Feedback(past, crowd.get(i));
            f.setRating(ratings[i]);
            f.setComment(comments[i]);
            f.setCreatedAt(past.getEndAt().plusHours(i + 1));
            feedback.save(f);
        }
        seat(past, crowd.get(6), RegistrationStatus.CONFIRMED, 6);
        Registration demoPast = seat(past, demo, RegistrationStatus.CHECKED_IN, 5);
        demoPast.setCheckedInAt(past.getStartAt().plusMinutes(12));
        Feedback demoRating = new Feedback(past, demo);
        demoRating.setRating(5);
        demoRating.setComment("The token talk changed how I build UIs.");
        demoRating.setCreatedAt(past.getEndAt().plusHours(2));
        feedback.save(demoRating);

        log.info("Seeded demo data. Sign in with admin@pulse.local, organizer@pulse.local or "
                + "attendee@pulse.local (password from app.seed.password).");
    }

    private Event event(User organizer, String title, Category category, String venue, LocalDate day,
                        LocalTime start, int hours, int capacity, EventStatus status, String description) {
        Event e = new Event(organizer);
        e.setTitle(title);
        e.setCategory(category);
        e.setVenue(venue);
        e.setStartAt(LocalDateTime.of(day, start));
        e.setEndAt(e.getStartAt().plusHours(hours));
        e.setCapacity(capacity);
        e.setStatus(status);
        e.setDescription(description);
        return events.save(e);
    }

    private Registration seat(Event e, User u, RegistrationStatus status, int daysAgo) {
        Registration r = new Registration(e, u, status);
        r.backdate(LocalDateTime.now().minusDays(daysAgo).withHour(9 + (int) (u.getId() % 10)));
        return registrations.save(r);
    }
}
