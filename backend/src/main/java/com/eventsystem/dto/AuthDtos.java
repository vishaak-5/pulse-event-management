package com.eventsystem.dto;

import com.eventsystem.model.Role;
import com.eventsystem.model.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Email @Size(max = 150) String email,
            @NotBlank @Size(min = 8, max = 72, message = "Password must be 8-72 characters") String password,
            @NotNull Role role) {
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    public record UserView(Long id, String name, String email, Role role, boolean enabled, LocalDateTime createdAt) {
        public static UserView of(User u) {
            return new UserView(u.getId(), u.getName(), u.getEmail(), u.getRole(), u.isEnabled(), u.getCreatedAt());
        }
    }

    public record AuthResponse(String token, UserView user) {
    }
}
