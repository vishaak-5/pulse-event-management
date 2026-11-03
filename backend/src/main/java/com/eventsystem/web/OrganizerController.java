package com.eventsystem.web;

import com.eventsystem.dto.EventDtos.EventRequest;
import com.eventsystem.dto.EventDtos.EventView;
import com.eventsystem.dto.RegistrationDtos.AttendeeView;
import com.eventsystem.dto.RegistrationDtos.ReleaseRequest;
import com.eventsystem.dto.RegistrationDtos.CheckInRequest;
import com.eventsystem.dto.RegistrationDtos.CheckInResult;
import com.eventsystem.dto.RegistrationDtos.LiveSnapshot;
import com.eventsystem.dto.StatsDtos.EventAnalytics;
import com.eventsystem.dto.StatsDtos.OrganizerOverview;
import com.eventsystem.security.AuthUser;
import com.eventsystem.service.EventService;
import com.eventsystem.service.LiveService;
import com.eventsystem.service.RegistrationService;
import com.eventsystem.service.StatsService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/organizer")
public class OrganizerController {

    private final EventService eventService;
    private final RegistrationService registrationService;
    private final StatsService statsService;
    private final LiveService liveService;

    public OrganizerController(EventService eventService, RegistrationService registrationService,
                               StatsService statsService, LiveService liveService) {
        this.eventService = eventService;
        this.registrationService = registrationService;
        this.statsService = statsService;
        this.liveService = liveService;
    }

    @GetMapping("/overview")
    public OrganizerOverview overview(@AuthenticationPrincipal AuthUser user) {
        return statsService.overview(user);
    }

    @GetMapping("/events")
    public List<EventView> myEvents(@AuthenticationPrincipal AuthUser user) {
        return eventService.listForOrganizer(user);
    }

    @PostMapping("/events")
    @ResponseStatus(HttpStatus.CREATED)
    public EventView create(@Valid @RequestBody EventRequest req, @AuthenticationPrincipal AuthUser user) {
        return eventService.create(req, user);
    }

    @PutMapping("/events/{id}")
    public EventView update(@PathVariable Long id, @Valid @RequestBody EventRequest req,
                            @AuthenticationPrincipal AuthUser user) {
        return eventService.update(id, req, user);
    }

    @PostMapping("/events/{id}/cancel")
    public EventView cancel(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
        return eventService.cancel(id, user);
    }

    @GetMapping("/events/{id}/attendees")
    public List<AttendeeView> attendees(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
        return registrationService.attendees(id, user);
    }

    @GetMapping("/events/{id}/analytics")
    public EventAnalytics analytics(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
        return statsService.forEvent(id, user);
    }

    @PostMapping("/checkin")
    public CheckInResult checkIn(@Valid @RequestBody CheckInRequest req, @AuthenticationPrincipal AuthUser user) {
        return registrationService.checkIn(req, user);
    }

    @PostMapping("/events/{id}/release-seats")
    public EventView releaseSeats(@PathVariable Long id, @Valid @RequestBody ReleaseRequest req,
                                  @AuthenticationPrincipal AuthUser user) {
        return eventService.releaseSeats(id, req.seats(), user);
    }

    @GetMapping("/events/{id}/live/snapshot")
    public LiveSnapshot liveSnapshot(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
        return registrationService.liveSnapshot(id, user);
    }

    /** Server-Sent Events stream of check-ins for the live wall. */
    @GetMapping(value = "/events/{id}/live", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter live(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
        registrationService.liveSnapshot(id, user); // ownership check
        return liveService.subscribe(id);
    }
}
