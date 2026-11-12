package com.bracketbattle.service;

import com.bracketbattle.advice.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RunTicketsTest {

    private static final String SECRET = "a-test-secret-that-is-at-least-32-bytes-long";
    private static final Instant NOW = Instant.parse("2026-11-11T12:00:00Z");
    private final RunTickets tickets = new RunTickets(SECRET, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void aTicketVerifiesForItsBracketAndCarriesItsClaims() {
        String ticket = tickets.issue(7, List.of(3L, 1L, 2L));
        RunTickets.Claims claims = tickets.verify(ticket, 7);
        assertThat(claims.bracketId()).isEqualTo(7);
        assertThat(claims.issuedAt()).isEqualTo(NOW);
        assertThat(claims.nonce()).hasSize(22);
        // Order and duplicates don't matter, membership does.
        assertThat(claims.entrantHash()).isEqualTo(RunTickets.entrantHash(List.of(1L, 2L, 3L, 3L)));
        assertThat(claims.entrantHash()).isNotEqualTo(RunTickets.entrantHash(List.of(1L, 2L, 4L)));
    }

    @Test
    void everyTicketHasItsOwnNonce() {
        assertThat(tickets.verify(tickets.issue(7, List.of(1L, 2L)), 7).nonce())
                .isNotEqualTo(tickets.verify(tickets.issue(7, List.of(1L, 2L)), 7).nonce());
    }

    @Test
    void anotherBracketIsRejected() {
        String ticket = tickets.issue(7, List.of(1L, 2L));
        assertThatThrownBy(() -> tickets.verify(ticket, 8))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("different bracket");
    }

    @Test
    void tamperedOrForeignTicketsAreRejected() {
        String ticket = tickets.issue(7, List.of(1L, 2L));
        String[] parts = ticket.split("\\.");
        byte[] payload = Base64.getUrlDecoder().decode(parts[0]);
        payload[payload.length - 1] ^= 1; // a different entrant set
        String tampered = Base64.getUrlEncoder().withoutPadding().encodeToString(payload) + "." + parts[1];

        RunTickets otherSecret = new RunTickets("another-secret-that-is-at-least-32-bytes", Clock.fixed(NOW, ZoneOffset.UTC));
        for (String bad : List.of(tampered, otherSecret.issue(7, List.of(1L, 2L)), "garbage", "a.b", ".", "",
                parts[0], parts[0] + ".", "!!!." + parts[1])) {
            assertThatThrownBy(() -> tickets.verify(bad, 7)).as(bad).isInstanceOf(InvalidRequestException.class);
        }
    }

    @Test
    void ticketsExpireAfterTwelveHoursAndCannotComeFromTheFuture() {
        String fresh = tickets.issue(7, List.of(1L, 2L), NOW.minus(Duration.ofHours(11)));
        assertThat(tickets.verify(fresh, 7)).isNotNull();
        String stale = tickets.issue(7, List.of(1L, 2L), NOW.minus(Duration.ofHours(12)).minusSeconds(1));
        assertThatThrownBy(() -> tickets.verify(stale, 7)).hasMessageContaining("too long ago");
        String future = tickets.issue(7, List.of(1L, 2L), NOW.plus(Duration.ofHours(1)));
        assertThatThrownBy(() -> tickets.verify(future, 7)).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void shortSecretsAreRefusedAndABlankOneIsRandom() {
        assertThatThrownBy(() -> new RunTickets("too short", Clock.systemUTC())).isInstanceOf(IllegalStateException.class);
        RunTickets a = new RunTickets("", Clock.systemUTC());
        RunTickets b = new RunTickets(null, Clock.systemUTC());
        assertThatThrownBy(() -> b.verify(a.issue(7, List.of(1L, 2L)), 7)).isInstanceOf(InvalidRequestException.class);
    }
}
