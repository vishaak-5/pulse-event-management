package com.eventsystem.service;

import com.eventsystem.model.Event;
import com.eventsystem.model.Registration;
import com.eventsystem.repository.EventRepository;
import com.eventsystem.repository.RegistrationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** Emails every seat holder once, roughly a day before the event starts. */
@Component
public class ReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final EventRepository events;
    private final RegistrationRepository registrations;
    private final EmailService email;

    public ReminderScheduler(EventRepository events, RegistrationRepository registrations, EmailService email) {
        this.events = events;
        this.registrations = registrations;
        this.email = email;
    }

    @Scheduled(cron = "${app.reminders.cron}")
    @Transactional
    public void sendReminders() {
        LocalDateTime now = LocalDateTime.now();
        for (Event e : events.findNeedingReminder(now, now.plusHours(25))) {
            for (Registration r : registrations.findSeatHolders(e.getId())) {
                email.send(r.getUser().getEmail(), "Tomorrow: " + e.getTitle(), "Your event is coming up",
                        "Reminder: \"" + e.getTitle() + "\" starts " + EmailService.when(e.getStartAt())
                                + " at " + e.getVenue() + ".\nKeep your QR ticket ready at the entrance.");
            }
            e.setReminderSent(true);
            log.info("Sent reminders for event {} ({})", e.getId(), e.getTitle());
        }
    }
}
