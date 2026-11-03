package com.eventsystem.service;

import com.eventsystem.dto.RegistrationDtos.*;
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
import java.util.List;

/**
 * Registration, cancellation, the waitlist and check-in.
 *
 * Every path that changes who holds a seat first takes a row lock on the event
 * ({@link EventRepository#findByIdForUpdate}), so seat counting and waitlist
 * promotion are serialised per event and capacity is never exceeded.
 */
@Service
public class RegistrationService {

    private final EventRepository events;
    private final UserRepository users;
    private final RegistrationRepository registrations;
    private final FeedbackRepository feedback;
    private final EmailService email;
    private final AttendanceForecaster forecaster;
    private final ApplicationEventPublisher publisher;

    public RegistrationService(EventRepository events, UserRepository users, RegistrationRepository registrations,
                               FeedbackRepository feedback, EmailService email, AttendanceForecaster forecaster,
                               ApplicationEventPublisher publisher) {
        this.events = events;
        this.users = users;
        this.registrations = registrations;
        this.feedback = feedback;
        this.email = email;
        this.forecaster = forecaster;
        this.publisher = publisher;
    }

    @Transactional
    public TicketView register(Long eventId, AuthUser attendee) {
        Event event = events.findByIdForUpdate(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        if (event.getStatus() != EventStatus.APPROVED) {
            throw ApiException.badRequest("This event is not open for registration.");
        }
        if (!event.getEndAt().isAfter(LocalDateTime.now())) {
            throw ApiException.badRequest("This event has already ended.");
        }
        if (event.getOrganizer().getId().equals(attendee.id())) {
            throw ApiException.badRequest("You cannot register for your own event.");
        }

        long taken = registrations.countByEventIdAndStatusIn(eventId, EventService.SEAT_HOLDING);
        RegistrationStatus status = taken < event.getCapacity()
                ? RegistrationStatus.CONFIRMED : RegistrationStatus.WAITLISTED;

        Registration reg = registrations.findByEventIdAndUserId(eventId, attendee.id()).orElse(null);
        if (reg != null) {
            if (reg.getStatus() != RegistrationStatus.CANCELLED) {
                throw ApiException.conflict("You are already registered for this event.");
            }
            reg.reactivate(status);
        } else {
            User user = users.findById(attendee.id()).orElseThrow(() -> ApiException.notFound("User"));
            reg = registrations.save(new Registration(event, user, status));
        }

        if (status == RegistrationStatus.CONFIRMED) {
            email.send(attendee.email(), "You're in: " + event.getTitle(), "Your seat is confirmed",
                    "See you at \"" + event.getTitle() + "\" on " + EmailService.when(event.getStartAt())
                            + " at " + event.getVenue() + ".\nYour QR ticket is in My Tickets - show it at the entrance.");
        } else {
            email.send(attendee.email(), "Waitlisted: " + event.getTitle(), "You're on the waitlist",
                    "\"" + event.getTitle() + "\" is full right now. We'll confirm your seat automatically "
                            + "and email you the moment one frees up.");
        }
        publisher.publishEvent(new LiveService.SeatsChanged(eventId));
        return toTicket(reg);
    }

    @Transactional
    public TicketView cancel(Long eventId, AuthUser attendee) {
        Event event = events.findByIdForUpdate(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        Registration reg = registrations.findByEventIdAndUserId(eventId, attendee.id())
                .filter(r -> r.getStatus() != RegistrationStatus.CANCELLED)
                .orElseThrow(() -> ApiException.notFound("Registration"));
        if (reg.getStatus() == RegistrationStatus.CHECKED_IN) {
            throw ApiException.badRequest("You have already checked in to this event.");
        }
        boolean freedSeat = reg.holdsSeat();
        reg.setStatus(RegistrationStatus.CANCELLED);
        if (freedSeat) {
            fillFromWaitlist(event);
        }
        publisher.publishEvent(new LiveService.SeatsChanged(eventId));
        return toTicket(reg);
    }

    /**
     * Promotes waitlisted attendees, oldest first, into any free seats.
     * Callers must already hold the event row lock.
     */
    void fillFromWaitlist(Event event) {
        if (event.getStatus() != EventStatus.APPROVED || !event.getEndAt().isAfter(LocalDateTime.now())) {
            return;
        }
        long free = event.getCapacity()
                - registrations.countByEventIdAndStatusIn(event.getId(), EventService.SEAT_HOLDING);
        if (free <= 0) {
            return;
        }
        for (Registration next : registrations.findWaitlist(event.getId())) {
            if (free-- <= 0) {
                break;
            }
            next.setStatus(RegistrationStatus.CONFIRMED);
            email.send(next.getUser().getEmail(), "Good news - you're in: " + event.getTitle(),
                    "A seat opened up for you",
                    "You've moved off the waitlist for \"" + event.getTitle() + "\" on "
                            + EmailService.when(event.getStartAt()) + ". Your QR ticket is now in My Tickets.");
        }
    }

    @Transactional(readOnly = true)
    public List<TicketView> myTickets(AuthUser attendee) {
        return registrations.findByUser(attendee.id()).stream().map(this::toTicket).toList();
    }

    /** The caller's ticket for one event, or null if they never registered. */
    @Transactional(readOnly = true)
    public TicketView myTicketForEvent(Long eventId, AuthUser attendee) {
        return registrations.findByEventIdAndUserId(eventId, attendee.id()).map(this::toTicket).orElse(null);
    }

    /** Ticket code for the QR image; only issued while the registration holds a seat. */
    @Transactional(readOnly = true)
    public String ticketCodeFor(Long registrationId, AuthUser attendee) {
        Registration reg = registrations.findById(registrationId)
                .filter(r -> r.getUser().getId().equals(attendee.id()))
                .orElseThrow(() -> ApiException.notFound("Ticket"));
        if (!reg.holdsSeat()) {
            throw ApiException.badRequest("This registration has no active ticket.");
        }
        return reg.getTicketCode();
    }

    @Transactional(readOnly = true)
    public List<AttendeeView> attendees(Long eventId, AuthUser actor) {
        Event event = events.findById(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        EventService.requireManage(event, actor);
        List<Registration> all = registrations.findByEvent(eventId);
        var estimates = forecaster.estimate(eventId, all.stream().filter(Registration::holdsSeat).toList());
        return all.stream().map(r -> {
            var est = r.holdsSeat() ? estimates.get(r.getUser().getId()) : null;
            return AttendeeView.of(r, est == null ? null : est.showRate(), est == null ? null : est.pastEvents());
        }).toList();
    }

    @Transactional(readOnly = true)
    public LiveSnapshot liveSnapshot(Long eventId, AuthUser actor) {
        Event event = events.findById(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        EventService.requireManage(event, actor);
        List<Arrival> recent = registrations.findRecentCheckIns(eventId).stream().limit(14)
                .map(r -> new Arrival(r.getUser().getName(), r.getCheckedInAt())).toList();
        return new LiveSnapshot(event.getId(), event.getTitle(), event.getVenue(), event.getStartAt(),
                event.getCapacity(), registrations.countByEventIdAndStatusIn(eventId, EventService.SEAT_HOLDING),
                registrations.countByEventIdAndStatus(eventId, RegistrationStatus.CHECKED_IN), recent);
    }

    @Transactional
    public CheckInResult checkIn(CheckInRequest req, AuthUser actor) {
        Registration reg = registrations.findByTicketCode(req.ticketCode().trim())
                .orElseThrow(() -> ApiException.notFound("Ticket"));
        Event event = reg.getEvent();
        EventService.requireManage(event, actor);
        if (req.eventId() != null && !req.eventId().equals(event.getId())) {
            throw ApiException.badRequest("This ticket is for a different event: " + event.getTitle() + ".");
        }
        switch (reg.getStatus()) {
            case CHECKED_IN -> throw ApiException.conflict(reg.getUser().getName() + " already checked in at "
                    + EmailService.when(reg.getCheckedInAt()) + ".");
            case WAITLISTED -> throw ApiException.badRequest("This attendee is still on the waitlist.");
            case CANCELLED -> throw ApiException.badRequest("This registration was cancelled.");
            case CONFIRMED -> {
                reg.setStatus(RegistrationStatus.CHECKED_IN);
                reg.setCheckedInAt(LocalDateTime.now());
            }
        }
        // Delivered to live walls after commit (LiveService).
        publisher.publishEvent(new LiveService.CheckInEvent(event.getId(), reg.getUser().getName(),
                reg.getCheckedInAt(),
                registrations.countByEventIdAndStatus(event.getId(), RegistrationStatus.CHECKED_IN),
                registrations.countByEventIdAndStatusIn(event.getId(), EventService.SEAT_HOLDING),
                event.getCapacity()));
        return new CheckInResult(reg.getUser().getName(), reg.getUser().getEmail(), event.getTitle(),
                reg.getCheckedInAt());
    }

    private TicketView toTicket(Registration r) {
        Integer position = null;
        if (r.getStatus() == RegistrationStatus.WAITLISTED) {
            position = (int) registrations.countAheadInWaitlist(r.getEvent().getId(), r.getQueuedAt(), r.getId()) + 1;
        }
        boolean rated = feedback.findByEventIdAndUserId(r.getEvent().getId(), r.getUser().getId()).isPresent();
        return TicketView.of(r, position, rated);
    }
}
