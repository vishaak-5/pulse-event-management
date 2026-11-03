package com.eventsystem.web;

import com.eventsystem.dto.RegistrationDtos.*;
import com.eventsystem.dto.StatsDtos.Recommendation;
import com.eventsystem.security.AuthUser;
import com.eventsystem.service.CertificateService;
import com.eventsystem.service.FeedbackService;
import com.eventsystem.service.QrService;
import com.eventsystem.service.RecommendationService;
import com.eventsystem.service.RegistrationService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/attendee")
public class AttendeeController {

    private final RegistrationService registrationService;
    private final FeedbackService feedbackService;
    private final QrService qrService;
    private final RecommendationService recommendationService;
    private final CertificateService certificateService;

    public AttendeeController(RegistrationService registrationService, FeedbackService feedbackService,
                              QrService qrService, RecommendationService recommendationService,
                              CertificateService certificateService) {
        this.registrationService = registrationService;
        this.feedbackService = feedbackService;
        this.qrService = qrService;
        this.recommendationService = recommendationService;
        this.certificateService = certificateService;
    }

    @PostMapping("/events/{eventId}/register")
    public TicketView register(@PathVariable Long eventId, @AuthenticationPrincipal AuthUser user) {
        return registrationService.register(eventId, user);
    }

    @DeleteMapping("/events/{eventId}/register")
    public TicketView cancel(@PathVariable Long eventId, @AuthenticationPrincipal AuthUser user) {
        return registrationService.cancel(eventId, user);
    }

    /** 204 when the user has never registered for this event. */
    @GetMapping("/events/{eventId}/ticket")
    public ResponseEntity<TicketView> ticketForEvent(@PathVariable Long eventId,
                                                     @AuthenticationPrincipal AuthUser user) {
        TicketView t = registrationService.myTicketForEvent(eventId, user);
        return t == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(t);
    }

    @GetMapping("/tickets")
    public List<TicketView> tickets(@AuthenticationPrincipal AuthUser user) {
        return registrationService.myTickets(user);
    }

    @GetMapping(value = "/tickets/{registrationId}/qr", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> qr(@PathVariable Long registrationId, @AuthenticationPrincipal AuthUser user) {
        String code = registrationService.ticketCodeFor(registrationId, user);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.IMAGE_PNG)
                .body(qrService.png(code, 360));
    }

    @GetMapping(value = "/tickets/{registrationId}/certificate", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> certificate(@PathVariable Long registrationId,
                                              @AuthenticationPrincipal AuthUser user) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("Content-Disposition", "attachment; filename=\"certificate-" + registrationId + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(certificateService.pdfFor(registrationId, user));
    }

    @GetMapping("/recommendations")
    public List<Recommendation> recommendations(@AuthenticationPrincipal AuthUser user) {
        return recommendationService.forAttendee(user);
    }

    @PostMapping("/events/{eventId}/feedback")
    public FeedbackView feedback(@PathVariable Long eventId, @Valid @RequestBody FeedbackRequest req,
                                 @AuthenticationPrincipal AuthUser user) {
        return feedbackService.submit(eventId, req, user);
    }
}
