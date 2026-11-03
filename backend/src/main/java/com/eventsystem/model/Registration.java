package com.eventsystem.model;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * One row per (event, attendee). Cancelling and re-registering reuses the row,
 * so {@code queuedAt} - not {@code createdAt} - decides waitlist order.
 */
@Entity
@Table(name = "registrations", uniqueConstraints = {
        @UniqueConstraint(name = "uk_registration_event_user", columnNames = {"event_id", "user_id"}),
        @UniqueConstraint(name = "uk_registration_ticket", columnNames = {"ticketCode"})
})
public class Registration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RegistrationStatus status;

    @Column(nullable = false, length = 36)
    private String ticketCode = UUID.randomUUID().toString();

    /**
     * Truncated to microseconds - the database's precision - so the value held in
     * memory equals the stored one and waitlist comparisons stay exact.
     */
    @Column(nullable = false)
    private LocalDateTime queuedAt = now();

    private LocalDateTime checkedInAt;

    /** Public id printed on the participation certificate; issued on first download. */
    @Column(length = 36, unique = true)
    private String certificateCode;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    protected Registration() {
    }

    public Registration(Event event, User user, RegistrationStatus status) {
        this.event = event;
        this.user = user;
        this.status = status;
    }

    /** Puts a cancelled registration back in play with a fresh place in the queue. */
    public void reactivate(RegistrationStatus newStatus) {
        this.status = newStatus;
        this.queuedAt = now();
        this.checkedInAt = null;
    }

    private static LocalDateTime now() {
        return LocalDateTime.now().truncatedTo(ChronoUnit.MICROS);
    }

    public boolean holdsSeat() {
        return status == RegistrationStatus.CONFIRMED || status == RegistrationStatus.CHECKED_IN;
    }

    public Long getId() { return id; }
    public Event getEvent() { return event; }
    public User getUser() { return user; }
    public RegistrationStatus getStatus() { return status; }
    public void setStatus(RegistrationStatus status) { this.status = status; }
    public String getTicketCode() { return ticketCode; }
    public LocalDateTime getQueuedAt() { return queuedAt; }
    public LocalDateTime getCheckedInAt() { return checkedInAt; }
    public void setCheckedInAt(LocalDateTime checkedInAt) { this.checkedInAt = checkedInAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public String getCertificateCode() { return certificateCode; }

    /** Issues the certificate code once; later calls keep the same code. */
    public String issueCertificateCode() {
        if (certificateCode == null) {
            certificateCode = UUID.randomUUID().toString();
        }
        return certificateCode;
    }

    /** For seeding demo history only; must be called before the first save. */
    public void backdate(LocalDateTime when) {
        this.createdAt = when.truncatedTo(ChronoUnit.MICROS);
        this.queuedAt = this.createdAt;
    }
}
