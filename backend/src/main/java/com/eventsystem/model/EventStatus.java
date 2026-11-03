package com.eventsystem.model;

/** Lifecycle of an event: organizers submit, admins approve or reject. */
public enum EventStatus {
    PENDING,
    APPROVED,
    REJECTED,
    CANCELLED
}
