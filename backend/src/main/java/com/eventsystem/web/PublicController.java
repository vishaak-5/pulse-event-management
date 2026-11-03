package com.eventsystem.web;

import com.eventsystem.dto.EventDtos.EventView;
import com.eventsystem.dto.RegistrationDtos.FeedbackView;
import com.eventsystem.dto.StatsDtos.PublicStats;
import com.eventsystem.model.Category;
import com.eventsystem.security.AuthUser;
import com.eventsystem.service.CertificateService;
import com.eventsystem.service.EventService;
import com.eventsystem.service.LiveService;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import com.eventsystem.service.FeedbackService;
import com.eventsystem.service.StatsService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Endpoints anyone can call, signed in or not. */
@RestController
@RequestMapping("/api")
public class PublicController {

    private final EventService eventService;
    private final FeedbackService feedbackService;
    private final StatsService statsService;
    private final CertificateService certificateService;
    private final LiveService liveService;

    public PublicController(EventService eventService, FeedbackService feedbackService, StatsService statsService,
                            CertificateService certificateService, LiveService liveService) {
        this.eventService = eventService;
        this.feedbackService = feedbackService;
        this.statsService = statsService;
        this.certificateService = certificateService;
        this.liveService = liveService;
    }

    @GetMapping("/events")
    public List<EventView> list(@RequestParam(required = false) String q,
                                @RequestParam(required = false) Category category,
                                @RequestParam(defaultValue = "false") boolean includePast) {
        return eventService.listPublic(q, category, includePast);
    }

    /** {@code viewer} is null for anonymous callers. */
    @GetMapping("/events/{id}")
    public EventView get(@PathVariable Long id, @AuthenticationPrincipal AuthUser viewer) {
        return eventService.get(id, viewer);
    }

    @GetMapping("/events/{id}/feedback")
    public List<FeedbackView> feedback(@PathVariable Long id) {
        return feedbackService.forEvent(id);
    }

    /** Public certificate check - the target of the QR code printed on every certificate. */
    @GetMapping("/certificates/{code}")
    public CertificateService.CertificateView verifyCertificate(@PathVariable String code) {
        return certificateService.verify(code);
    }

    /** Live seat counts for one event (Server-Sent Events). */
    @GetMapping(value = "/events/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter seatStream(@PathVariable Long id) {
        eventService.get(id, null); // 404 unless the event is public
        return liveService.subscribeSeats(id);
    }

    @GetMapping("/stats/public")
    public PublicStats stats() {
        return statsService.publicStats();
    }
}
