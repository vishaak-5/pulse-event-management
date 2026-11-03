package com.eventsystem.service;

import com.eventsystem.dto.EventDtos.EventRequest;
import com.eventsystem.dto.EventDtos.EventView;
import com.eventsystem.model.*;
import com.eventsystem.repository.EventRepository;
import com.eventsystem.repository.FeedbackRepository;
import com.eventsystem.repository.RegistrationRepository;
import com.eventsystem.repository.UserRepository;
import com.eventsystem.security.AuthUser;
import com.eventsystem.web.ApiException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@Service
public class EventService {

    static final Set<RegistrationStatus> SEAT_HOLDING =
            EnumSet.of(RegistrationStatus.CONFIRMED, RegistrationStatus.CHECKED_IN);

    private final EventRepository events;
    private final UserRepository users;
    private final RegistrationRepository registrations;
    private final FeedbackRepository feedback;
    private final RegistrationService registrationService;
    private final EmailService email;
    private final ApplicationEventPublisher publisher;

    public EventService(EventRepository events, UserRepository users, RegistrationRepository registrations,
                        FeedbackRepository feedback, RegistrationService registrationService, EmailService email,
                        ApplicationEventPublisher publisher) {
        this.events = events;
        this.users = users;
        this.registrations = registrations;
        this.feedback = feedback;
        this.registrationService = registrationService;
        this.email = email;
        this.publisher = publisher;
    }

    // ---- views ----

    EventView view(Event e) {
        long taken = registrations.countByEventIdAndStatusIn(e.getId(), SEAT_HOLDING);
        long waitlist = registrations.countByEventIdAndStatus(e.getId(), RegistrationStatus.WAITLISTED);
        long recent = registrations.countByEventIdAndCreatedAtAfter(e.getId(), LocalDateTime.now().minusHours(24));
        return EventView.of(e, taken, waitlist, feedback.averageRating(e.getId()), feedback.countByEventId(e.getId()),
                recent);
    }

    @Transactional(readOnly = true)
    public List<EventView> listPublic(String q, Category category, boolean includePast) {
        String query = (q == null || q.isBlank()) ? null : q.trim();
        return events.searchPublic(query, category, includePast, LocalDateTime.now()).stream().map(this::view).toList();
    }

    /** Approved events are public; others are visible only to their organizer and admins. */
    @Transactional(readOnly = true)
    public EventView get(Long id, AuthUser viewer) {
        Event e = find(id);
        if (e.getStatus() != EventStatus.APPROVED && !canManage(e, viewer)) {
            throw ApiException.notFound("Event");
        }
        return view(e);
    }

    @Transactional(readOnly = true)
    public List<EventView> listForOrganizer(AuthUser organizer) {
        return events.findByOrganizer(organizer.id()).stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public List<EventView> listForAdmin(EventStatus status) {
        return events.findForAdmin(status).stream().map(this::view).toList();
    }

    // ---- organizer actions ----

    @Transactional
    public EventView create(EventRequest req, AuthUser organizer) {
        validateTimes(req);
        User owner = users.findById(organizer.id()).orElseThrow(() -> ApiException.notFound("User"));
        Event e = new Event(owner);
        apply(e, req);
        // Admin-created events skip the approval queue.
        e.setStatus(organizer.isAdmin() ? EventStatus.APPROVED : EventStatus.PENDING);
        return view(events.save(e));
    }

    @Transactional
    public EventView update(Long id, EventRequest req, AuthUser actor) {
        validateTimes(req);
        Event e = events.findByIdForUpdate(id).orElseThrow(() -> ApiException.notFound("Event"));
        requireManage(e, actor);
        if (e.getStatus() == EventStatus.CANCELLED) {
            throw ApiException.badRequest("A cancelled event cannot be edited.");
        }
        long taken = registrations.countByEventIdAndStatusIn(id, SEAT_HOLDING);
        if (req.capacity() < taken) {
            throw ApiException.badRequest("Capacity cannot go below the " + taken + " seats already taken.");
        }
        int oldCapacity = e.getCapacity();
        if (!req.startAt().equals(e.getStartAt())) {
            e.setReminderSent(false);
        }
        apply(e, req);
        // A rejected event goes back for review once the organizer fixes it.
        if (e.getStatus() == EventStatus.REJECTED && !actor.isAdmin()) {
            e.setStatus(EventStatus.PENDING);
            e.setRejectionReason(null);
        }
        if (req.capacity() > oldCapacity) {
            registrationService.fillFromWaitlist(e);
        }
        publisher.publishEvent(new LiveService.SeatsChanged(id));
        return view(e);
    }

    /**
     * Acts on the turnout forecast: adds {@code seats} extra seats so that many
     * people are promoted from the waitlist straight away. Allowed once per
     * event, so repeated clicks cannot keep overbooking.
     */
    @Transactional
    public EventView releaseSeats(Long id, int seats, AuthUser actor) {
        Event e = events.findByIdForUpdate(id).orElseThrow(() -> ApiException.notFound("Event"));
        requireManage(e, actor);
        if (e.getStatus() != EventStatus.APPROVED || !e.getStartAt().isAfter(LocalDateTime.now())) {
            throw ApiException.badRequest("Seats can only be released before an approved event starts.");
        }
        if (e.getReleasedSeats() > 0) {
            throw ApiException.conflict("Forecast seats were already released for this event.");
        }
        long waiting = registrations.countByEventIdAndStatus(id, RegistrationStatus.WAITLISTED);
        if (seats > waiting) {
            throw ApiException.badRequest("Only " + waiting + " people are on the waitlist.");
        }
        e.setCapacity(e.getCapacity() + seats);
        e.setReleasedSeats(seats);
        registrationService.fillFromWaitlist(e);
        publisher.publishEvent(new LiveService.SeatsChanged(id));
        return view(e);
    }

    @Transactional
    public EventView cancel(Long id, AuthUser actor) {
        Event e = find(id);
        requireManage(e, actor);
        if (e.getStatus() == EventStatus.CANCELLED) {
            return view(e);
        }
        e.setStatus(EventStatus.CANCELLED);
        for (Registration r : registrations.findByEvent(id)) {
            if (r.getStatus() != RegistrationStatus.CANCELLED) {
                r.setStatus(RegistrationStatus.CANCELLED);
                email.send(r.getUser().getEmail(), "Event cancelled: " + e.getTitle(), "This event has been cancelled",
                        "We're sorry - \"" + e.getTitle() + "\" scheduled for " + EmailService.when(e.getStartAt())
                                + " has been cancelled by the organizer. Your registration has been released.");
            }
        }
        publisher.publishEvent(new LiveService.SeatsChanged(id));
        return view(e);
    }

    // ---- admin actions ----

    @Transactional
    public EventView approve(Long id) {
        Event e = find(id);
        if (e.getStatus() != EventStatus.PENDING && e.getStatus() != EventStatus.REJECTED) {
            throw ApiException.badRequest("Only pending or rejected events can be approved.");
        }
        e.setStatus(EventStatus.APPROVED);
        e.setRejectionReason(null);
        email.send(e.getOrganizer().getEmail(), "Approved: " + e.getTitle(), "Your event is live",
                "\"" + e.getTitle() + "\" has been approved and is now open for registrations.");
        return view(e);
    }

    @Transactional
    public EventView reject(Long id, String reason) {
        Event e = find(id);
        if (e.getStatus() != EventStatus.PENDING) {
            throw ApiException.badRequest("Only pending events can be rejected.");
        }
        e.setStatus(EventStatus.REJECTED);
        e.setRejectionReason(reason == null || reason.isBlank() ? null : reason.trim());
        email.send(e.getOrganizer().getEmail(), "Changes needed: " + e.getTitle(), "Your event needs changes",
                "\"" + e.getTitle() + "\" was not approved."
                        + (e.getRejectionReason() != null ? "\nReason: " + e.getRejectionReason() : "")
                        + "\nEdit the event and it will be sent for review again.");
        return view(e);
    }

    // ---- helpers ----

    Event find(Long id) {
        return events.findById(id).orElseThrow(() -> ApiException.notFound("Event"));
    }

    static boolean canManage(Event e, AuthUser user) {
        return user != null && (user.isAdmin() || e.getOrganizer().getId().equals(user.id()));
    }

    static void requireManage(Event e, AuthUser user) {
        if (!canManage(e, user)) {
            throw ApiException.forbidden("Only this event's organizer can do that.");
        }
    }

    private static void validateTimes(EventRequest req) {
        if (!req.endAt().isAfter(req.startAt())) {
            throw ApiException.badRequest("End time must be after the start time.");
        }
    }

    private static void apply(Event e, EventRequest req) {
        e.setTitle(req.title().trim());
        e.setDescription(req.description().trim());
        e.setCategory(req.category());
        e.setVenue(req.venue().trim());
        e.setStartAt(req.startAt());
        e.setEndAt(req.endAt());
        e.setCapacity(req.capacity());
    }
}
