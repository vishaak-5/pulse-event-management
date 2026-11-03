package com.eventsystem.service;

import com.eventsystem.dto.AuthDtos.UserView;
import com.eventsystem.model.Role;
import com.eventsystem.model.User;
import com.eventsystem.repository.UserRepository;
import com.eventsystem.security.AuthUser;
import com.eventsystem.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AdminService {

    private final UserRepository users;

    public AdminService(UserRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<UserView> listUsers() {
        return users.findAllByOrderByCreatedAtDesc().stream().map(UserView::of).toList();
    }

    @Transactional
    public UserView setEnabled(Long userId, boolean enabled, AuthUser admin) {
        User u = find(userId);
        if (u.getId().equals(admin.id())) {
            throw ApiException.badRequest("You cannot disable your own account.");
        }
        u.setEnabled(enabled);
        return UserView.of(u);
    }

    @Transactional
    public UserView setRole(Long userId, Role role, AuthUser admin) {
        User u = find(userId);
        if (u.getId().equals(admin.id())) {
            throw ApiException.badRequest("You cannot change your own role.");
        }
        u.setRole(role);
        return UserView.of(u);
    }

    private User find(Long id) {
        return users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
    }
}
