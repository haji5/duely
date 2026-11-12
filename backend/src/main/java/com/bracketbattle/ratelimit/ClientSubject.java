package com.bracketbattle.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.regex.Pattern;

/**
 * Turns a client address into a rate-limit subject. An IPv6 connection holds at least a /64 and
 * can pick a new source address inside it for every request, so IPv6 counts per /64; IPv4 counts
 * per address, and an IPv4-mapped IPv6 address as the IPv4 address it carries.
 */
public final class ClientSubject {

    /** Shared by every address that cannot be parsed, so a malformed one never gets a fresh bucket. */
    static final String UNKNOWN = "unknown";

    private static final Pattern IPV4 = Pattern.compile("(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}");
    // Starting with a hex digit or a colon and containing one, InetAddress parses the string as a
    // literal (or rejects it) and never resolves it as a name.
    private static final Pattern IPV6_CHARS = Pattern.compile("[0-9A-Fa-f:][0-9A-Fa-f:.]*");

    private ClientSubject() {}

    /** The subject for the request's client (getRemoteAddr is already the forwarded address). */
    public static String of(HttpServletRequest request) {
        return fromAddress(request.getRemoteAddr());
    }

    static String fromAddress(String address) {
        if (address == null) {
            return UNKNOWN;
        }
        String a = address.strip();
        if (a.startsWith("[") && a.endsWith("]")) {
            a = a.substring(1, a.length() - 1);
        }
        int zone = a.indexOf('%');
        if (zone >= 0) {
            a = a.substring(0, zone);
        }
        if (IPV4.matcher(a).matches()) {
            return a;
        }
        if (a.indexOf(':') < 0 || !IPV6_CHARS.matcher(a).matches()) {
            return UNKNOWN;
        }
        InetAddress parsed;
        try {
            parsed = InetAddress.getByName(a);
        } catch (UnknownHostException e) {
            return UNKNOWN;
        }
        // Java already turns an IPv4-mapped literal (::ffff:a.b.c.d) into an Inet4Address.
        if (parsed instanceof Inet4Address v4) {
            return v4.getHostAddress();
        }
        if (parsed instanceof Inet6Address v6) {
            byte[] b = v6.getAddress();
            return String.format("%x:%x:%x:%x::/64",
                    hextet(b, 0), hextet(b, 2), hextet(b, 4), hextet(b, 6));
        }
        return UNKNOWN;
    }

    private static int hextet(byte[] b, int i) {
        return ((b[i] & 0xff) << 8) | (b[i + 1] & 0xff);
    }
}
