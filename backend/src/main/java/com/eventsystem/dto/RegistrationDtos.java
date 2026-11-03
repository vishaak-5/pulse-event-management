package com.eventsystem.dto;

import com.eventsystem.model.Registration;
import com.eventsystem.model.RegistrationStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public final class RegistrationDtos {

    private RegistrationDtos() {
    }

    /** An attendee's own ticket. {@code waitlistPosition} is 1-based, null unless waitlisted. */
    public record TicketView(
            Long id,
            Long eventId,
            String eventTitle,
            String venue,
            LocalDateTime startAt,
            LocalDateTime endAt,
            String category,
            RegistrationStatus status,
            String ticketCode,
            Integer waitlistPosition,
            LocalDateTime registeredAt,
            LocalDateTime checkedInAt,
            boolean feedbackGiven) {

        public static TicketView of(Registration r, Integer waitlistPosition, boolean feedbackGiven) {
            var e = r.getEvent();
            boolean showCode = r.holdsSeat();
            return new TicketView(r.getId(), e.getId(), e.getTitle(), e.getVenue(), e.getStartAt(), e.getEndAt(),
                    e.getCategory().name(), r.getStatus(), showCode ? r.getTicketCode() : null, waitlistPosition,
                    r.getCreatedAt(), r.getCheckedInAt(), feedbackGiven);
        }
    }

    /**
     * A row in the organizer's attendee list. {@code showRate} is the forecast
     * chance this seat holder turns up (null for waitlisted / cancelled rows).
     */
    public record AttendeeView(
            Long registrationId,
            Long userId,
            String name,
            String email,
            RegistrationStatus status,
            LocalDateTime queuedAt,
            LocalDateTime checkedInAt,
            Double showRate,
            Long pastEvents) {

        public static AttendeeView of(Registration r, Double showRate, Long pastEvents) {
            return new AttendeeView(r.getId(), r.getUser().getId(), r.getUser().getName(), r.getUser().getEmail(),
                    r.getStatus(), r.getQueuedAt(), r.getCheckedInAt(), showRate, pastEvents);
        }
    }

    public record ReleaseRequest(@jakarta.validation.constraints.Min(1) int seats) {
    }

    /** First frame of the live wall: totals plus the most recent arrivals. */
    public record LiveSnapshot(
            Long eventId,
            String title,
            String venue,
            LocalDateTime startAt,
            int capacity,
            long seated,
            long checkedIn,
            java.util.List<Arrival> recent) {
    }

    public record Arrival(String name, LocalDateTime at) {
    }

    public record CheckInRequest(@NotBlank String ticketCode, Long eventId) {
    }

    public record CheckInResult(String attendeeName, String attendeeEmail, String eventTitle, LocalDateTime checkedInAt) {
    }

    public record FeedbackRequest(@Min(1) @Max(5) int rating, @Size(max = 1000) String comment) {
    }

    public record FeedbackView(Long id, String userName, int rating, String comment, LocalDateTime createdAt) {
    }
}
