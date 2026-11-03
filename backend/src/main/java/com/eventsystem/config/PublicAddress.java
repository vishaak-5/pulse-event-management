package com.eventsystem.config;

/**
 * Turns an address from configuration into a full public origin.
 *
 *   "https://example.com" -> unchanged
 *   "example.com"         -> "https://example.com"
 *   "pulse-web-solq"      -> "https://pulse-web-solq.onrender.com"
 *
 * The last case is what a Render Blueprint passes between services (the
 * internal host name, which is also the service's public subdomain).
 */
public final class PublicAddress {

    private PublicAddress() {
    }

    public static String normalize(String value) {
        String v = value.trim().replaceAll("/+$", "");
        if (v.startsWith("http://") || v.startsWith("https://")) {
            return v;
        }
        return "https://" + (v.contains(".") || v.startsWith("localhost") ? v : v + ".onrender.com");
    }
}
