package com.eventsystem.service;

import com.eventsystem.config.PublicAddress;
import com.eventsystem.model.Event;
import com.eventsystem.model.Registration;
import com.eventsystem.model.RegistrationStatus;
import com.eventsystem.repository.RegistrationRepository;
import com.eventsystem.security.AuthUser;
import com.eventsystem.web.ApiException;
import com.lowagie.text.*;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Participation certificates for attendees who were checked in at an event.
 * Each certificate carries a unique code and a QR code pointing to the public
 * verification page, so anyone can confirm it was really issued by Pulse.
 */
@Service
public class CertificateService {

    public record CertificateView(String code, String attendeeName, String eventTitle, String category,
                                  String venue, LocalDateTime startAt, LocalDateTime endAt,
                                  String organizerName, LocalDateTime checkedInAt) {
    }

    private static final Color NAVY = new Color(0x1F, 0x38, 0x64);
    private static final Color MINT = new Color(0x2F, 0xD9, 0x9A);
    private static final Color GREY = new Color(0x59, 0x59, 0x59);
    private static final Color PAPER = new Color(0xFB, 0xFC, 0xFE);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMMM yyyy");

    private final RegistrationRepository registrations;
    private final QrService qr;
    private final String publicUrl;

    public CertificateService(RegistrationRepository registrations, QrService qr,
                              @Value("${app.public-url}") String publicUrl) {
        this.registrations = registrations;
        this.qr = qr;
        this.publicUrl = PublicAddress.normalize(publicUrl);
    }

    /** Issues (once) and renders the caller's certificate for a registration. */
    @Transactional
    public byte[] pdfFor(Long registrationId, AuthUser attendee) {
        Registration r = registrations.findFullById(registrationId)
                .filter(x -> x.getUser().getId().equals(attendee.id()))
                .orElseThrow(() -> ApiException.notFound("Registration"));
        if (r.getStatus() != RegistrationStatus.CHECKED_IN) {
            throw ApiException.badRequest("Certificates are only issued to attendees who were checked in.");
        }
        if (r.getEvent().getEndAt().isAfter(LocalDateTime.now())) {
            throw ApiException.badRequest("Your certificate will be available once the event ends.");
        }
        String code = r.issueCertificateCode();
        return render(r, code);
    }

    @Transactional(readOnly = true)
    public CertificateView verify(String code) {
        Registration r = registrations.findByCertificateCode(code.trim())
                .orElseThrow(() -> ApiException.notFound("Certificate"));
        Event e = r.getEvent();
        return new CertificateView(code, r.getUser().getName(), e.getTitle(), e.getCategory().name(), e.getVenue(),
                e.getStartAt(), e.getEndAt(), e.getOrganizer().getName(), r.getCheckedInAt());
    }

    private byte[] render(Registration r, String code) {
        Event e = r.getEvent();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4.rotate(), 0, 0, 0, 0);
        try {
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            doc.addTitle("Certificate of Participation - " + e.getTitle());
            doc.addAuthor("Pulse - Smart Event Management");
            doc.open();
            PdfContentByte cb = writer.getDirectContent();
            float w = doc.getPageSize().getWidth();
            float h = doc.getPageSize().getHeight();

            // paper, double frame, accent band
            cb.setColorFill(PAPER);
            cb.rectangle(0, 0, w, h);
            cb.fill();
            cb.setColorStroke(NAVY);
            cb.setLineWidth(3f);
            cb.rectangle(26, 26, w - 52, h - 52);
            cb.stroke();
            cb.setLineWidth(0.7f);
            cb.rectangle(34, 34, w - 68, h - 68);
            cb.stroke();
            cb.setColorFill(MINT);
            cb.rectangle(w / 2 - 60, h - 92, 120, 4);
            cb.fill();

            // brand mark: the pulse line
            cb.setColorStroke(MINT);
            cb.setLineWidth(2.4f);
            float bx = w / 2 - 34;
            float by = h - 70;
            cb.moveTo(bx, by);
            cb.lineTo(bx + 12, by);
            cb.lineTo(bx + 20, by + 14);
            cb.lineTo(bx + 32, by - 14);
            cb.lineTo(bx + 40, by + 6);
            cb.lineTo(bx + 52, by);
            cb.lineTo(bx + 68, by);
            cb.stroke();

            center(cb, "CERTIFICATE OF PARTICIPATION", new Font(Font.HELVETICA, 26, Font.BOLD, NAVY), w / 2, h - 140);
            center(cb, "This is to certify that", new Font(Font.TIMES_ROMAN, 15, Font.ITALIC, GREY), w / 2, h - 190);
            center(cb, r.getUser().getName(), new Font(Font.TIMES_ROMAN, 40, Font.BOLDITALIC, NAVY), w / 2, h - 245);
            cb.setColorStroke(new Color(0xBF, 0xBF, 0xBF));
            cb.setLineWidth(0.6f);
            cb.moveTo(w / 2 - 200, h - 260);
            cb.lineTo(w / 2 + 200, h - 260);
            cb.stroke();
            center(cb, "attended and was checked in at", new Font(Font.TIMES_ROMAN, 15, Font.ITALIC, GREY),
                    w / 2, h - 292);
            center(cb, e.getTitle(), new Font(Font.HELVETICA, 22, Font.BOLD, Color.BLACK), w / 2, h - 330);
            center(cb, e.getStartAt().format(DAY) + "  ·  " + e.getVenue(),
                    new Font(Font.HELVETICA, 13, Font.NORMAL, GREY), w / 2, h - 356);

            // signature block
            float sy = 118;
            cb.setColorStroke(NAVY);
            cb.setLineWidth(0.8f);
            cb.moveTo(w / 2 - 110, sy);
            cb.lineTo(w / 2 + 110, sy);
            cb.stroke();
            center(cb, e.getOrganizer().getName(), new Font(Font.HELVETICA, 12, Font.BOLD, NAVY), w / 2, sy - 18);
            center(cb, "Event Organizer", new Font(Font.HELVETICA, 10, Font.NORMAL, GREY), w / 2, sy - 33);

            // verification QR + code
            String verifyUrl = publicUrl + "/verify/" + code;
            Image img = Image.getInstance(qr.png(verifyUrl, 300));
            img.scaleAbsolute(84, 84);
            img.setAbsolutePosition(w - 140, 56);
            cb.addImage(img);
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT,
                    new Phrase("Scan to verify", new Font(Font.HELVETICA, 8, Font.NORMAL, GREY)), w - 148, 110, 0);
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT,
                    new Phrase("ID " + code, new Font(Font.COURIER, 7, Font.NORMAL, GREY)), w - 148, 98, 0);

            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT,
                    new Phrase("Pulse  ·  Smart Event Management and Registration System",
                            new Font(Font.HELVETICA, 8, Font.NORMAL, GREY)), 56, 56, 0);
            doc.close();
        } catch (DocumentException | IOException ex) {
            throw new IllegalStateException("Could not render certificate", ex);
        }
        return out.toByteArray();
    }

    private static void center(PdfContentByte cb, String text, Font font, float x, float y) {
        ColumnText.showTextAligned(cb, Element.ALIGN_CENTER, new Phrase(text, font), x, y, 0);
    }
}
