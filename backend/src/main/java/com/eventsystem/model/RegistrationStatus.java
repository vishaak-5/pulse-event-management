package com.eventsystem.model;

public enum RegistrationStatus {
    /** Holds a seat. */
    CONFIRMED,
    /** Event was full; promoted automatically when a seat frees up. */
    WAITLISTED,
    CANCELLED,
    /** Ticket scanned at the venue. Still counts as holding a seat. */
    CHECKED_IN
}
