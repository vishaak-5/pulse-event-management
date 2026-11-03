package com.eventsystem.service;

import com.eventsystem.dto.AuthDtos.AuthResponse;
import com.eventsystem.dto.AuthDtos.LoginRequest;
import com.eventsystem.dto.AuthDtos.RegisterRequest;
import com.eventsystem.dto.AuthDtos.UserView;
import com.eventsystem.model.Role;
import com.eventsystem.model.User;
import com.eventsystem.repository.UserRepository;
import com.eventsystem.security.JwtService;
import com.eventsystem.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailService email;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService,
                       EmailService email) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.email = email;
    }

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        if (req.role() == Role.ADMIN) {
            throw ApiException.forbidden("Admin accounts cannot be created by sign-up.");
        }
        String emailAddress = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(emailAddress)) {
            throw ApiException.conflict("An account with this email already exists.");
        }
        User user = users.save(new User(req.name().trim(), emailAddress,
                passwordEncoder.encode(req.password()), req.role()));
        email.send(user.getEmail(), "Welcome to Pulse Events", "Welcome, " + user.getName() + "!",
                "Your " + user.getRole().name().toLowerCase() + " account is ready. "
                        + (user.getRole() == Role.ORGANIZER
                        ? "Create your first event - it goes live once an admin approves it."
                        : "Browse upcoming events and grab your first ticket."));
        return new AuthResponse(jwtService.issue(user), UserView.of(user));
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest req) {
        User user = users.findByEmailIgnoreCase(req.email().trim())
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Incorrect email or password."));
        if (!user.isEnabled()) {
            throw ApiException.forbidden("This account has been disabled. Contact the administrator.");
        }
        return new AuthResponse(jwtService.issue(user), UserView.of(user));
    }

    @Transactional(readOnly = true)
    public UserView me(Long userId) {
        return users.findById(userId).map(UserView::of).orElseThrow(() -> ApiException.notFound("User"));
    }
}
