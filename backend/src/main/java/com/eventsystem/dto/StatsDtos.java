package com.eventsystem.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class StatsDtos {

    private StatsDtos() {
    }

    public record DayCount(LocalDate date, long count) {
    }

    /** Analytics for one event, shown on the organizer dashboard. */
    public record EventAnalytics(
            Long eventId,
            String title,
            int capacity,
            long confirmed,
            long checkedIn,
            long waitlisted,
            long cancelled,
            double fillRate,
            double attendanceRate,
            Double averageRating,
            long ratingCount,
            Map<Integer, Long> ratingDistribution,
            List<DayCount> registrationsByDay,
            double expectedAttendance,
            int predictedNoShows,
            int suggestedExtraSeats,
            int releasedSeats) {
    }

    /** An event suggested to an attendee, with the plain-language reason it was picked. */
    public record Recommendation(com.eventsystem.dto.EventDtos.EventView event, String reason, double score) {
    }

    /** Totals across all of an organizer's events. */
    public record OrganizerOverview(
            long totalEvents,
            long upcomingEvents,
            long pendingApproval,
            long totalRegistrations,
            long totalCheckedIn,
            Double averageRating) {
    }

    public record AdminStats(
            Map<String, Long> usersByRole,
            Map<String, Long> eventsByStatus,
            long activeRegistrations,
            long checkIns) {
    }

    public record PublicStats(long upcomingEvents, long attendees, long organizers, long ticketsIssued) {
    }
}
