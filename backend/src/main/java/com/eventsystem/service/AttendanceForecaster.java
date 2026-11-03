package com.eventsystem.service;

import com.eventsystem.model.Registration;
import com.eventsystem.repository.RegistrationRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Estimates how likely each seat holder is to actually turn up, from their own
 * history: of the seats they held at past events, how many did they check in to?
 *
 * The rate is smoothed toward a prior so one missed event does not brand a
 * newcomer as unreliable:  showRate = (shows + PRIOR * WEIGHT) / (held + WEIGHT).
 * With no history the estimate is simply PRIOR.
 */
@Service
public class AttendanceForecaster {

    /** Typical turnout for free campus events with confirmed seats. */
    static final double PRIOR = 0.85;
    /** How many "imaginary" past events the prior is worth. */
    static final double WEIGHT = 2.0;

    public record Estimate(double showRate, long pastEvents, long pastShows) {
    }

    private final RegistrationRepository registrations;

    public AttendanceForecaster(RegistrationRepository registrations) {
        this.registrations = registrations;
    }

    /** Show-up estimate for each user id in {@code seatHolders}, keyed by user id. */
    public Map<Long, Estimate> estimate(Long eventId, Collection<Registration> seatHolders) {
        Map<Long, Estimate> result = new HashMap<>();
        if (seatHolders.isEmpty()) {
            return result;
        }
        List<Long> ids = seatHolders.stream().map(r -> r.getUser().getId()).toList();
        Map<Long, long[]> history = new HashMap<>();
        for (Object[] row : registrations.attendanceHistory(ids, eventId, LocalDateTime.now())) {
            long held = ((Number) row[1]).longValue();
            long shows = row[2] == null ? 0 : ((Number) row[2]).longValue();
            history.put((Long) row[0], new long[]{held, shows});
        }
        for (Long id : ids) {
            long[] h = history.getOrDefault(id, new long[]{0, 0});
            result.put(id, new Estimate(rate(h[0], h[1]), h[0], h[1]));
        }
        return result;
    }

    public static double rate(long held, long shows) {
        return (shows + PRIOR * WEIGHT) / (held + WEIGHT);
    }
}
