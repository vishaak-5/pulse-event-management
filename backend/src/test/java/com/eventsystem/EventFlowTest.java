package com.eventsystem;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** End-to-end API flow: organizer creates, admin approves, attendees fill seats, waitlist, check-in, feedback. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EventFlowTest {

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper json;
    @Autowired
    com.eventsystem.repository.UserRepository users;
    @Autowired
    org.springframework.security.crypto.password.PasswordEncoder encoder;

    @Test
    void fullRegistrationLifecycle() throws Exception {
        users.save(new com.eventsystem.model.User("Root", "root@test.local", encoder.encode("Admin@1234"),
                com.eventsystem.model.Role.ADMIN));
        String admin = login("root@test.local", "Admin@1234");
        String organizer = signUp("ORGANIZER");
        String alice = signUp("ATTENDEE");
        String bob = signUp("ATTENDEE");
        String carol = signUp("ATTENDEE");

        // Organizer creates a 2-seat event; it starts PENDING and is hidden from the public list.
        LocalDateTime start = LocalDateTime.now().plusDays(2).withNano(0);
        JsonNode created = call(post("/api/organizer/events"), organizer, Map.of(
                "title", "Test Night", "description", "desc", "category", "TECH", "venue", "Hall",
                "startAt", start.toString(), "endAt", start.plusHours(2).toString(), "capacity", 2), 201);
        long eventId = created.get("id").asLong();
        assert "PENDING".equals(created.get("status").asText());
        mvc.perform(post("/api/attendee/events/" + eventId + "/register").header("Authorization", alice))
                .andExpect(status().isBadRequest());

        // Attendees cannot reach organizer or admin endpoints.
        mvc.perform(post("/api/admin/events/" + eventId + "/approve").header("Authorization", alice))
                .andExpect(status().isForbidden());

        call(post("/api/admin/events/" + eventId + "/approve"), admin, null, 200);

        // Two seats fill, the third attendee is waitlisted at position 1.
        JsonNode a = call(post("/api/attendee/events/" + eventId + "/register"), alice, null, 200);
        call(post("/api/attendee/events/" + eventId + "/register"), bob, null, 200);
        JsonNode c = call(post("/api/attendee/events/" + eventId + "/register"), carol, null, 200);
        assert "CONFIRMED".equals(a.get("status").asText());
        assert "WAITLISTED".equals(c.get("status").asText());
        assert c.get("waitlistPosition").asInt() == 1 : "waitlist position was " + c;
        assert c.get("ticketCode").isNull();

        // Duplicate registration is rejected.
        mvc.perform(post("/api/attendee/events/" + eventId + "/register").header("Authorization", alice))
                .andExpect(status().isConflict());

        // Bob cancels -> Carol is promoted automatically.
        call(delete("/api/attendee/events/" + eventId + "/register"), bob, null, 200);
        JsonNode carolNow = call(get("/api/attendee/events/" + eventId + "/ticket"), carol, null, 200);
        assert "CONFIRMED".equals(carolNow.get("status").asText());

        // Check-in with Alice's ticket works once, then reports a duplicate.
        String code = a.get("ticketCode").asText();
        call(post("/api/organizer/checkin"), organizer, Map.of("ticketCode", code), 200);
        mvc.perform(post("/api/organizer/checkin").header("Authorization", organizer)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("ticketCode", code))))
                .andExpect(status().isConflict());

        // QR image is served for a seat-holding ticket.
        mvc.perform(get("/api/attendee/tickets/" + a.get("id").asLong() + "/qr").header("Authorization", alice))
                .andExpect(status().isOk());

        // Feedback is not allowed before the event starts.
        mvc.perform(post("/api/attendee/events/" + eventId + "/feedback").header("Authorization", alice)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rating\":5}"))
                .andExpect(status().isBadRequest());

        // Analytics reflect it all.
        mvc.perform(get("/api/organizer/events/" + eventId + "/analytics").header("Authorization", organizer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confirmed").value(1))
                .andExpect(jsonPath("$.checkedIn").value(1))
                .andExpect(jsonPath("$.cancelled").value(1))
                .andExpect(jsonPath("$.waitlisted").value(0));

        // Public list now shows the event with no seats left.
        mvc.perform(get("/api/events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].seatsLeft").value(0))
                .andExpect(jsonPath("$[0].registrationsLast24h").value(3));

        // No certificate before the event has ended.
        mvc.perform(get("/api/attendee/tickets/" + a.get("id").asLong() + "/certificate").header("Authorization", alice))
                .andExpect(status().isBadRequest());

        // Live wall snapshot reflects the check-in.
        mvc.perform(get("/api/organizer/events/" + eventId + "/live/snapshot").header("Authorization", organizer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checkedIn").value(1))
                .andExpect(jsonPath("$.recent[0].name").value("User"));

        // Turnout forecast: Alice is in (1.0), Carol has no history (prior 0.85).
        mvc.perform(get("/api/organizer/events/" + eventId + "/analytics").header("Authorization", organizer))
                .andExpect(jsonPath("$.expectedAttendance", org.hamcrest.Matchers.closeTo(1.85, 1e-6)));

        // A new attendee lands on the waitlist; releasing one forecast seat promotes them.
        String dave = signUp("ATTENDEE");
        JsonNode d = call(post("/api/attendee/events/" + eventId + "/register"), dave, null, 200);
        assert "WAITLISTED".equals(d.get("status").asText());
        JsonNode released = call(post("/api/organizer/events/" + eventId + "/release-seats"), organizer,
                Map.of("seats", 1), 200);
        assert released.get("capacity").asInt() == 3;
        JsonNode daveNow = call(get("/api/attendee/events/" + eventId + "/ticket"), dave, null, 200);
        assert "CONFIRMED".equals(daveNow.get("status").asText());

        // Releasing is allowed only once per event.
        mvc.perform(post("/api/organizer/events/" + eventId + "/release-seats").header("Authorization", organizer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"seats\":1}"))
                .andExpect(status().isConflict());

        // A fresh attendee gets the event recommended, with a reason.
        String erin = signUp("ATTENDEE");
        mvc.perform(get("/api/attendee/recommendations").header("Authorization", erin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].event.id").value(eventId))
                .andExpect(jsonPath("$[0].reason").isNotEmpty());
    }

    @Autowired
    com.eventsystem.repository.EventRepository eventRepo;
    @Autowired
    com.eventsystem.repository.RegistrationRepository registrationRepo;

    @Test
    void certificateIsIssuedOnceAndPubliclyVerifiable() throws Exception {
        var org = users.save(new com.eventsystem.model.User("Org", UUID.randomUUID() + "@t.local",
                encoder.encode("x"), com.eventsystem.model.Role.ORGANIZER));
        var ev = new com.eventsystem.model.Event(org);
        ev.setTitle("Past Talk");
        ev.setDescription("d");
        ev.setCategory(com.eventsystem.model.Category.TECH);
        ev.setVenue("Hall");
        ev.setStartAt(LocalDateTime.now().minusDays(3));
        ev.setEndAt(LocalDateTime.now().minusDays(3).plusHours(2));
        ev.setCapacity(10);
        ev.setStatus(com.eventsystem.model.EventStatus.APPROVED);
        ev = eventRepo.save(ev);

        String email = UUID.randomUUID() + "@t.local";
        String token = call(post("/api/auth/register"), null,
                Map.of("name", "Asha", "email", email, "password", "Secret@123", "role", "ATTENDEE"), 201)
                .get("token").asText();
        var user = users.findByEmailIgnoreCase(email).orElseThrow();
        var reg = new com.eventsystem.model.Registration(ev, user, com.eventsystem.model.RegistrationStatus.CHECKED_IN);
        reg.setCheckedInAt(ev.getStartAt().plusMinutes(5));
        reg = registrationRepo.save(reg);

        byte[] pdf = mvc.perform(get("/api/attendee/tickets/" + reg.getId() + "/certificate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assert new String(pdf, 0, 4).equals("%PDF");

        String code = registrationRepo.findById(reg.getId()).orElseThrow().getCertificateCode();
        assert code != null;
        mvc.perform(get("/api/certificates/" + code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attendeeName").value("Asha"))
                .andExpect(jsonPath("$.eventTitle").value("Past Talk"));

        // Downloading again keeps the same certificate id; unknown ids are rejected.
        mvc.perform(get("/api/attendee/tickets/" + reg.getId() + "/certificate").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        assert code.equals(registrationRepo.findById(reg.getId()).orElseThrow().getCertificateCode());
        mvc.perform(get("/api/certificates/not-a-real-code")).andExpect(status().isNotFound());
    }

    @Test
    void validationErrorsReadLikeSentences() throws Exception {
        String organizerToken = signUp("ORGANIZER");
        mvc.perform(post("/api/organizer/events").header("Authorization", organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"\",\"description\":\"d\",\"category\":\"TECH\",\"venue\":\"Hall\","
                                + "\"startAt\":\"2020-01-01T10:00:00\",\"endAt\":\"2020-01-01T12:00:00\",\"capacity\":5}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", org.hamcrest.Matchers.containsString("Title is required.")))
                .andExpect(jsonPath("$.error", org.hamcrest.Matchers.containsString("Start time must be in the future.")))
                .andExpect(jsonPath("$.error", org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("startAt"))));
    }

    @Test
    void forecastSmoothsTowardThePrior() {
        assert Math.abs(com.eventsystem.service.AttendanceForecaster.rate(0, 0) - 0.85) < 1e-9;
        assert Math.abs(com.eventsystem.service.AttendanceForecaster.rate(2, 0) - 0.425) < 1e-9;
        assert Math.abs(com.eventsystem.service.AttendanceForecaster.rate(4, 4) - (4 + 1.7) / 6) < 1e-9;
    }

    private String signUp(String role) throws Exception {
        String email = UUID.randomUUID() + "@test.local";
        JsonNode res = call(post("/api/auth/register"), null,
                Map.of("name", "User", "email", email, "password", "Secret@123", "role", role), 201);
        return "Bearer " + res.get("token").asText();
    }

    private String login(String email, String password) throws Exception {
        JsonNode res = call(post("/api/auth/login"), null, Map.of("email", email, "password", password), 200);
        return "Bearer " + res.get("token").asText();
    }

    private JsonNode call(MockHttpServletRequestBuilder req, String auth, Object body, int expected) throws Exception {
        if (auth != null) {
            req.header("Authorization", auth);
        }
        if (body != null) {
            req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        }
        String out = mvc.perform(req).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return out.isEmpty() ? null : json.readTree(out);
    }
}
