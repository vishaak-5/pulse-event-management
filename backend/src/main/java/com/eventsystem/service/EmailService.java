package com.eventsystem.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Sends notification emails off the request thread. With app.mail.enabled=false
 * (the default) messages are only logged, so the app works with no mail setup.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE, d MMM yyyy 'at' h:mm a");

    private final JavaMailSender mailSender;
    private final boolean enabled;
    private final String from;

    public EmailService(JavaMailSender mailSender,
                        @Value("${app.mail.enabled}") boolean enabled,
                        @Value("${app.mail.from}") String from) {
        this.mailSender = mailSender;
        this.enabled = enabled;
        this.from = from;
    }

    public static String when(LocalDateTime t) {
        return t.format(WHEN);
    }

    @Async
    public void send(String to, String subject, String heading, String bodyText) {
        if (!enabled) {
            log.info("[email disabled] to={} subject=\"{}\" body=\"{}\"", to, subject, bodyText);
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html(heading, bodyText), true);
            mailSender.send(message);
            log.info("Email sent to {}: {}", to, subject);
        } catch (Exception e) {
            log.warn("Could not send email to {}: {}", to, e.getMessage());
        }
    }

    private static String html(String heading, String bodyText) {
        String body = HtmlUtils.htmlEscape(bodyText).replace("\n", "<br>");
        return """
                <div style="font-family:Segoe UI,Arial,sans-serif;background:#07090d;padding:32px">
                  <div style="max-width:520px;margin:auto;background:#10141b;border:1px solid #1f2733;
                              border-radius:16px;padding:28px;color:#e6edf3">
                    <div style="font-size:12px;letter-spacing:.2em;color:#8bf5c4;text-transform:uppercase">Pulse Events</div>
                    <h1 style="font-size:22px;margin:12px 0 16px">%s</h1>
                    <p style="font-size:15px;line-height:1.6;color:#b7c2cf">%s</p>
                  </div>
                </div>
                """.formatted(HtmlUtils.htmlEscape(heading), body);
    }
}
