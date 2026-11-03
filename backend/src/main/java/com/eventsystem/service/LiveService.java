package com.eventsystem.service;

import com.eventsystem.model.RegistrationStatus;
import com.eventsystem.repository.EventRepository;
import com.eventsystem.repository.RegistrationRepository;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Real-time push over Server-Sent Events, on two channels:
 *  - check-ins, for the organizer's live wall;
 *  - seat counts, for anyone viewing a public event page.
 * Both are sent only after the change's transaction commits, so a screen never
 * shows something that was rolled back.
 */
@Service
public class LiveService {

    /** Published by {@link RegistrationService#checkIn} inside its transaction. */
    public record CheckInEvent(Long eventId, String attendeeName, LocalDateTime at, long checkedIn, long seated,
                               int capacity) {
    }

    /** Published whenever who holds a seat (or the capacity) may have changed. */
    public record SeatsChanged(Long eventId) {
    }

    public record SeatCounts(Long eventId, int capacity, long seatsTaken, long seatsLeft, long waitlistCount,
                             long registrationsLast24h) {
    }

    private final Map<Long, List<SseEmitter>> walls = new ConcurrentHashMap<>();
    private final Map<Long, List<SseEmitter>> seatViewers = new ConcurrentHashMap<>();
    private final EventRepository events;
    private final RegistrationRepository registrations;

    public LiveService(EventRepository events, RegistrationRepository registrations) {
        this.events = events;
        this.registrations = registrations;
    }

    public SseEmitter subscribe(Long eventId) {
        return open(walls, eventId);
    }

    public SseEmitter subscribeSeats(Long eventId) {
        return open(seatViewers, eventId);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onCheckIn(CheckInEvent event) {
        broadcast(walls.get(event.eventId()), "checkin", event);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onSeatsChanged(SeatsChanged change) {
        List<SseEmitter> list = seatViewers.get(change.eventId());
        if (list == null || list.isEmpty()) {
            return;
        }
        events.findById(change.eventId()).ifPresent(e -> {
            long taken = registrations.countByEventIdAndStatusIn(e.getId(), EventService.SEAT_HOLDING);
            long waiting = registrations.countByEventIdAndStatus(e.getId(), RegistrationStatus.WAITLISTED);
            long recent = registrations.countByEventIdAndCreatedAtAfter(e.getId(), LocalDateTime.now().minusHours(24));
            broadcast(list, "seats", new SeatCounts(e.getId(), e.getCapacity(), taken,
                    Math.max(0, e.getCapacity() - taken), waiting, recent));
        });
    }

    /** Keeps idle connections open through proxies and drops dead ones. */
    @Scheduled(fixedRate = 20_000)
    public void heartbeat() {
        for (Map<Long, List<SseEmitter>> channel : List.of(walls, seatViewers)) {
            channel.values().forEach(list -> {
                for (SseEmitter emitter : list) {
                    try {
                        emitter.send(SseEmitter.event().comment("ping"));
                    } catch (IOException | IllegalStateException e) {
                        list.remove(emitter);
                    }
                }
            });
        }
    }

    private static SseEmitter open(Map<Long, List<SseEmitter>> channel, Long eventId) {
        SseEmitter emitter = new SseEmitter(0L);
        List<SseEmitter> list = channel.computeIfAbsent(eventId, k -> new CopyOnWriteArrayList<>());
        list.add(emitter);
        Runnable remove = () -> list.remove(emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(e -> remove.run());
        try {
            emitter.send(SseEmitter.event().name("ready").data("ok"));
        } catch (IOException e) {
            remove.run();
        }
        return emitter;
    }

    private static void broadcast(List<SseEmitter> list, String name, Object payload) {
        if (list == null) {
            return;
        }
        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event().name(name).data(payload, MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException e) {
                list.remove(emitter);
            }
        }
    }
}
