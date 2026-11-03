package com.eventsystem.security;

import com.eventsystem.model.Role;

/** The authenticated principal placed in the security context by {@link JwtAuthFilter}. */
public record AuthUser(Long id, String email, String name, Role role) {

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }
}
