package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@TestPropertySource(properties = {
        "app.rate-limit.buckets.read.limit=3",
        "app.rate-limit.buckets.result-ip.limit=2",
        "app.rate-limit.buckets.bracket-create.limit=1",
        "app.rate-limit.buckets.report.limit=2"
})
class RateLimitIT extends IntegrationTest {

    @Test
    void readsAreLimitedPerIpWithRetryAfter() throws Exception {
        for (int i = 0; i < 3; i++) {
            assertThat(perform(get("/brackets")).getResponse().getStatus()).isEqualTo(200);
        }
        MvcResult limited = perform(get("/brackets"));

        assertThat(limited.getResponse().getStatus()).isEqualTo(429);
        long retryAfter = Long.parseLong(limited.getResponse().getHeader("Retry-After"));
        assertThat(retryAfter).isBetween(1L, 60L);
        assertThat(body(limited).get("message").asString()).startsWith("Too many requests: the limit is 3 per minute");

        // Other clients have their own bucket
        MvcResult other = perform(get("/brackets").with(r -> { r.setRemoteAddr("203.0.113.9"); return r; }));
        assertThat(other.getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void ipv6ClientsCountPerSlash64AndMappedAddressesAsIpv4() throws Exception {
        // Rotating the address inside one /64 does not reset the limit.
        for (String address : List.of("2001:db8:42:1::1", "2001:db8:42:1::2", "2001:db8:42:1:abcd::3")) {
            assertThat(perform(get("/brackets").with(remoteAddr(address))).getResponse().getStatus()).isEqualTo(200);
        }
        assertThat(perform(get("/brackets").with(remoteAddr("2001:db8:42:1:ffff:ffff:ffff:ffff"))).getResponse().getStatus())
                .isEqualTo(429);
        assertThat(perform(get("/brackets").with(remoteAddr("2001:db8:42:2::1"))).getResponse().getStatus()).isEqualTo(200);

        for (int i = 0; i < 3; i++) {
            assertThat(perform(get("/brackets").with(remoteAddr("198.51.100.20"))).getResponse().getStatus()).isEqualTo(200);
        }
        assertThat(perform(get("/brackets").with(remoteAddr("::ffff:198.51.100.20"))).getResponse().getStatus()).isEqualTo(429);
    }

    @Test
    void guestSubmissionsAndCreationAreLimited() throws Exception {
        long id = createBracket(USER_A, "Limited", 2).get("id").asLong();
        MvcResult secondCreate = perform(as(USER_A, postJson("/brackets", bracketPayload("Again", "image", 2))));
        assertThat(secondCreate.getResponse().getStatus()).isEqualTo(429);
        assertThat(body(secondCreate).get("message").asString()).contains("the limit is 1 per hour");

        List<Long> ranking = List.of(1L, 2L); // never reaches validation once limited
        redis.delete(redis.keys("ratelimit:read:*")); // item lookups below count as reads
        List<Long> items = itemIds(id);
        assertThat(perform(postJson("/brackets/" + id + "/results", runPayload(items, null, null))).getResponse().getStatus()).isEqualTo(200);
        assertThat(perform(postJson("/brackets/" + id + "/results", runPayload(items, null, null))).getResponse().getStatus()).isEqualTo(200);
        MvcResult limited = perform(postJson("/brackets/" + id + "/results", runPayload(ranking, null, null)));
        assertThat(limited.getResponse().getStatus()).isEqualTo(429);
        assertThat(limited.getResponse().getHeader("Retry-After")).isNotNull();
    }

    @Test
    void reportsAreLimitedPerSubject() throws Exception {
        long id = createBracket(USER_A, "Reported often", 2).get("id").asLong();
        Map<String, Object> report = Map.of("targetType", "bracket", "targetId", id, "reason", "spam");
        assertThat(perform(postJson("/reports", report)).getResponse().getStatus()).isEqualTo(204);
        assertThat(perform(postJson("/reports", report)).getResponse().getStatus()).isEqualTo(204);
        MvcResult limited = perform(postJson("/reports", report));
        assertThat(limited.getResponse().getStatus()).isEqualTo(429);
        assertThat(body(limited).get("message").asString()).contains("the limit is 2 per hour");
        // A signed-in reporter has their own bucket.
        assertThat(perform(as(USER_B, postJson("/reports", report))).getResponse().getStatus()).isEqualTo(204);
    }

    private static RequestPostProcessor remoteAddr(String address) {
        return request -> {
            request.setRemoteAddr(address);
            return request;
        };
    }
}
