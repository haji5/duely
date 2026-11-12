package com.bracketbattle.service;

import com.bracketbattle.advice.InvalidRequestException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Stateless, signed run tickets. The server picks a run's entrants when it starts and signs what
 * it picked, so a submission can only score a run the server handed out:
 * {@code base64url(payload) + "." + base64url(HMAC-SHA256(secret, payload))}, where the payload is
 * a version, the bracket id, a random 128-bit nonce, the issue time (epoch seconds) and a SHA-256
 * of the sorted entrant ids. The nonce doubles as the submission's idempotency token. The uid is
 * not bound: a player may sign in between starting and saving.
 */
@Component
public class RunTickets {

    private static final Logger log = LoggerFactory.getLogger(RunTickets.class);

    static final byte VERSION = 1;
    /** Long enough for a 500-entry run with breaks, short enough that old tickets die. */
    public static final Duration MAX_AGE = Duration.ofHours(12);
    /** Tolerated clock difference between instances for tickets that look issued in the future. */
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(5);
    private static final int MIN_SECRET_BYTES = 32;
    private static final int NONCE_BYTES = 16;
    private static final int PAYLOAD_BYTES = 1 + 8 + NONCE_BYTES + 8 + 32;

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    private final SecretKeySpec key;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    /** What a valid ticket says. {@code nonce} is the run's submission token. */
    public record Claims(long bracketId, String nonce, Instant issuedAt, byte[] entrantHash) {}

    @Autowired
    public RunTickets(@Value("${app.run-ticket.secret:}") String secret) {
        this(secret, Clock.systemUTC());
    }

    RunTickets(String secret, Clock clock) {
        this.clock = clock;
        byte[] bytes;
        if (secret == null || secret.isBlank()) {
            bytes = new byte[MIN_SECRET_BYTES];
            new SecureRandom().nextBytes(bytes);
            log.warn("RUN_TICKET_SECRET is not set: using a random per-process secret. Runs started before a restart "
                    + "can't be saved after it, and more than one backend instance needs the variable set.");
        } else {
            bytes = secret.getBytes(StandardCharsets.UTF_8);
            if (bytes.length < MIN_SECRET_BYTES) {
                throw new IllegalStateException("RUN_TICKET_SECRET must be at least " + MIN_SECRET_BYTES + " bytes");
            }
        }
        this.key = new SecretKeySpec(bytes, "HmacSHA256");
    }

    /** A ticket for these entrants, issued now. */
    public String issue(long bracketId, Collection<Long> entrantIds) {
        return issue(bracketId, entrantIds, clock.instant());
    }

    /** A ticket with an explicit issue time; tests use it to stand in for a run that took a while. */
    public String issue(long bracketId, Collection<Long> entrantIds, Instant issuedAt) {
        byte[] nonce = new byte[NONCE_BYTES];
        random.nextBytes(nonce);
        ByteBuffer payload = ByteBuffer.allocate(PAYLOAD_BYTES)
                .put(VERSION)
                .putLong(bracketId)
                .put(nonce)
                .putLong(issuedAt.getEpochSecond())
                .put(entrantHash(entrantIds));
        byte[] bytes = payload.array();
        return B64.encodeToString(bytes) + "." + B64.encodeToString(mac(bytes));
    }

    /**
     * Checks signature, version, bracket and age, in that order.
     *
     * @throws InvalidRequestException with a message the player can act on
     */
    public Claims verify(String ticket, long bracketId) {
        byte[] payload;
        byte[] signature;
        try {
            int dot = ticket.indexOf('.');
            if (dot < 0) throw new IllegalArgumentException("no signature");
            payload = B64D.decode(ticket.substring(0, dot));
            signature = B64D.decode(ticket.substring(dot + 1));
        } catch (IllegalArgumentException e) {
            throw invalid();
        }
        if (payload.length != PAYLOAD_BYTES || !MessageDigest.isEqual(mac(payload), signature)) {
            throw invalid();
        }
        ByteBuffer buffer = ByteBuffer.wrap(payload);
        if (buffer.get() != VERSION) {
            throw invalid();
        }
        long ticketBracket = buffer.getLong();
        byte[] nonce = new byte[NONCE_BYTES];
        buffer.get(nonce);
        Instant issuedAt = Instant.ofEpochSecond(buffer.getLong());
        byte[] hash = new byte[32];
        buffer.get(hash);
        if (ticketBracket != bracketId) {
            throw ticketProblem("This run was started on a different bracket");
        }
        Instant now = clock.instant();
        if (issuedAt.isAfter(now.plus(CLOCK_SKEW)) || issuedAt.plus(MAX_AGE).isBefore(now)) {
            throw ticketProblem("This run was started too long ago to be saved. Start a new one.");
        }
        return new Claims(ticketBracket, B64.encodeToString(nonce), issuedAt, hash);
    }

    /** SHA-256 over the sorted, de-duplicated ids, so order and repeats don't matter. */
    public static byte[] entrantHash(Collection<Long> entrantIds) {
        List<Long> sorted = entrantIds.stream().distinct().sorted().toList();
        ByteBuffer buffer = ByteBuffer.allocate(8 * sorted.size());
        sorted.forEach(buffer::putLong);
        try {
            return MessageDigest.getInstance("SHA-256").digest(buffer.array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private byte[] mac(byte[] payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return mac.doFinal(payload);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static InvalidRequestException invalid() {
        return ticketProblem("This run's ticket is not valid. Reload the page and play again.");
    }

    private static InvalidRequestException ticketProblem(String message) {
        return new InvalidRequestException(message, Map.of("ticket", message));
    }
}
