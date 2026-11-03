package com.eventsystem.web;

import com.eventsystem.dto.AuthDtos.UserView;
import com.eventsystem.dto.EventDtos.EventView;
import com.eventsystem.dto.EventDtos.RejectRequest;
import com.eventsystem.dto.StatsDtos.AdminStats;
import com.eventsystem.model.EventStatus;
import com.eventsystem.model.Role;
import com.eventsystem.security.AuthUser;
import com.eventsystem.service.AdminService;
import com.eventsystem.service.EventService;
import com.eventsystem.service.StatsService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final EventService eventService;
    private final AdminService adminService;
    private final StatsService statsService;

    public AdminController(EventService eventService, AdminService adminService, StatsService statsService) {
        this.eventService = eventService;
        this.adminService = adminService;
        this.statsService = statsService;
    }

    @GetMapping("/stats")
    public AdminStats stats() {
        return statsService.admin();
    }

    @GetMapping("/events")
    public List<EventView> events(@RequestParam(required = false) EventStatus status) {
        return eventService.listForAdmin(status);
    }

    @PostMapping("/events/{id}/approve")
    public EventView approve(@PathVariable Long id) {
        return eventService.approve(id);
    }

    @PostMapping("/events/{id}/reject")
    public EventView reject(@PathVariable Long id, @Valid @RequestBody(required = false) RejectRequest req) {
        return eventService.reject(id, req == null ? null : req.reason());
    }

    @GetMapping("/users")
    public List<UserView> users() {
        return adminService.listUsers();
    }

    public record UserUpdate(Boolean enabled, Role role) {
    }

    @PatchMapping("/users/{id}")
    public UserView updateUser(@PathVariable Long id, @RequestBody UserUpdate req,
                               @AuthenticationPrincipal AuthUser admin) {
        UserView result = null;
        if (req.enabled() != null) {
            result = adminService.setEnabled(id, req.enabled(), admin);
        }
        if (req.role() != null) {
            result = adminService.setRole(id, req.role(), admin);
        }
        if (result == null) {
            throw ApiException.badRequest("Nothing to update.");
        }
        return result;
    }
}
