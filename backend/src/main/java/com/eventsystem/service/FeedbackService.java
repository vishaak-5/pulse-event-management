package com.eventsystem.service;

import com.eventsystem.dto.RegistrationDtos.FeedbackRequest;
import com.eventsystem.dto.RegistrationDtos.FeedbackView;
import com.eventsystem.model.*;
import com.eventsystem.repository.EventRepository;
import com.eventsystem.repository.FeedbackRepository;
import com.eventsystem.repository.RegistrationRepository;
import com.eventsystem.security.AuthUser;
import com.eventsystem.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class FeedbackService {

    private final EventRepository events;
    private final RegistrationRepository registrations;
    private final FeedbackRepository feedback;

    public FeedbackService(EventRepository events, RegistrationRepository registrations, FeedbackRepository feedback) {
        this.events = events;
        this.registrations = registrations;
        this.feedback = feedback;
    }

    /** Attendees who held a seat can rate an event once it has started; resubmitting updates the rating. */
    @Transactional
    public FeedbackView submit(Long eventId, FeedbackRequest req, AuthUser attendee) {
        Event event = events.findById(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        if (event.getStartAt().isAfter(LocalDateTime.now())) {
            throw ApiException.badRequest("You can rate this event once it has started.");
        }
        Registration reg = registrations.findByEventIdAndUserId(eventId, attendee.id())
                .filter(Registration::holdsSeat)
                .orElseThrow(() -> ApiException.forbidden("Only attendees of this event can rate it."));
        Feedback f = feedback.findByEventIdAndUserId(eventId, attendee.id())
                .orElseGet(() -> new Feedback(event, reg.getUser()));
        f.setRating(req.rating());
        f.setComment(req.comment() == null || req.comment().isBlank() ? null : req.comment().trim());
        f.setCreatedAt(LocalDateTime.now());
        f = feedback.save(f);
        return toView(f);
    }

    @Transactional(readOnly = true)
    public List<FeedbackView> forEvent(Long eventId) {
        Event event = events.findById(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        if (event.getStatus() != EventStatus.APPROVED) {
            throw ApiException.notFound("Event");
        }
        return feedback.findByEvent(eventId).stream().map(FeedbackService::toView).toList();
    }

    private static FeedbackView toView(Feedback f) {
        return new FeedbackView(f.getId(), f.getUser().getName(), f.getRating(), f.getComment(), f.getCreatedAt());
    }
}
