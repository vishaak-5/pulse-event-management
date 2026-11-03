package com.eventsystem.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> handleApi(ApiException e) {
        return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage()));
    }

    /** Field names as a person would say them, for validation messages. */
    private static final Map<String, String> FIELD_LABELS = Map.ofEntries(
            Map.entry("title", "Title"), Map.entry("description", "Description"), Map.entry("category", "Category"),
            Map.entry("venue", "Venue"), Map.entry("startAt", "Start time"), Map.entry("endAt", "End time"),
            Map.entry("capacity", "Capacity"), Map.entry("name", "Name"), Map.entry("email", "Email"),
            Map.entry("password", "Password"), Map.entry("role", "Account type"), Map.entry("rating", "Rating"),
            Map.entry("comment", "Comment"), Map.entry("ticketCode", "Ticket code"), Map.entry("seats", "Seats"),
            Map.entry("reason", "Reason"));

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::humanize)
                .distinct()
                .collect(Collectors.joining(" "));
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }

    /**
     * "startAt" + "must not be null" -> "Start time is required."
     * Custom messages that are already sentences are kept as written.
     */
    static String humanize(FieldError f) {
        String msg = f.getDefaultMessage() == null ? "is not valid" : f.getDefaultMessage();
        if (!msg.isEmpty() && Character.isUpperCase(msg.charAt(0))) {
            return msg.endsWith(".") ? msg : msg + ".";
        }
        String label = FIELD_LABELS.getOrDefault(f.getField(), f.getField());
        String phrase = switch (msg) {
            case "must not be blank", "must not be null", "must not be empty" -> "is required";
            case "must be a well-formed email address" -> "must be a valid email address";
            default -> msg.matches("size must be between 0 and \\d+")
                    ? "can be at most " + msg.replaceAll("\\D+", " ").trim().split(" ")[1] + " characters"
                    : msg;
        };
        return label + " " + phrase + ".";
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, String>> handleBadInput(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("error", "Some of the details entered are not valid. Please check and try again."));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleConflict(DataIntegrityViolationException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "That conflicts with existing data."));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> handleNoRoute(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception e) {
        log.error("Unhandled error", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Something went wrong on our side."));
    }
}
