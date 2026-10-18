package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@TestPropertySource(properties = {
        "app.rate-limit.buckets.read.limit=3",
        "app.rate-limit.buckets.result-ip.limit=2",
        "app.rate-limit.buckets.bracket-create.limit=1"
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
}
