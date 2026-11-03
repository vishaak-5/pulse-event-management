package com.eventsystem.dto;

import com.eventsystem.model.Category;
import com.eventsystem.model.Event;
import com.eventsystem.model.EventStatus;
import jakarta.validation.constraints.*;

import java.time.LocalDateTime;

public final class EventDtos {

    private EventDtos() {
    }

    public record EventRequest(
            @NotBlank @Size(max = 150) String title,
            @NotBlank @Size(max = 5000) String description,
            @NotNull Category category,
            @NotBlank @Size(max = 200) String venue,
            @NotNull @Future(message = "Start time must be in the future") LocalDateTime startAt,
            @NotNull LocalDateTime endAt,
            @Min(value = 1, message = "Capacity must be at least 1") @Max(100000) int capacity) {
    }

    public record RejectRequest(@Size(max = 300) String reason) {
    }

    /** Public card / detail view of an event, with live seat counts. */
    public record EventView(
            Long id,
            String title,
            String description,
            Category category,
            String venue,
            LocalDateTime startAt,
            LocalDateTime endAt,
            int capacity,
            long seatsTaken,
            long seatsLeft,
            long waitlistCount,
            EventStatus status,
            String rejectionReason,
            Long organizerId,
            String organizerName,
            Double averageRating,
            long ratingCount,
            long registrationsLast24h) {

        public static EventView of(Event e, long seatsTaken, long waitlistCount, Double avgRating, long ratingCount,
                                   long registrationsLast24h) {
            return new EventView(e.getId(), e.getTitle(), e.getDescription(), e.getCategory(), e.getVenue(),
                    e.getStartAt(), e.getEndAt(), e.getCapacity(), seatsTaken,
                    Math.max(0, e.getCapacity() - seatsTaken), waitlistCount, e.getStatus(), e.getRejectionReason(),
                    e.getOrganizer().getId(), e.getOrganizer().getName(), avgRating, ratingCount,
                    registrationsLast24h);
        }
    }
}
