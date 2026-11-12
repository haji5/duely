package com.bracketbattle.support;

import tools.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** With Valkey unreachable the app must still start and serve from Postgres, without long stalls. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(FakeDnsConfig.class)
class ValkeyDownIT {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTest.POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", IntegrationTest.POSTGRES::getUsername);
        registry.add("spring.datasource.password", IntegrationTest.POSTGRES::getPassword);
        registry.add("spring.data.redis.host", () -> "127.0.0.1");
        registry.add("spring.data.redis.port", () -> "1"); // nothing listens here
        registry.add("app.rate-limit.buckets.read.limit", () -> "2");
        registry.add("app.rate-limit.buckets.report.limit", () -> "2");
    }

    @MockitoBean
    FirebaseAuth firebaseAuth;

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Test
    void servesReadsAndWritesFromPostgres() throws Exception {
        long start = System.nanoTime();
        assertThat(mvc.perform(get("/brackets")).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(mvc.perform(get("/brackets/987654321")).andReturn().getResponse().getStatus()).isEqualTo(404);

        // Guest submission still works: its limit counts in memory, cache evictions are skipped.
        MvcResult missing = mvc.perform(post("/brackets/987654321/results").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("ticket", "t",
                        "matches", List.of(Map.of("winnerId", 1, "loserId", 2)))))).andReturn();
        assertThat(missing.getResponse().getStatus()).isEqualTo(404);
        assertThat((System.nanoTime() - start) / 1_000_000).as("ms for three requests").isLessThan(5000);

        // Readiness ignores Valkey; the overall health shows it as down.
        assertThat(mvc.perform(get("/actuator/health/readiness")).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(mvc.perform(get("/actuator/health")).andReturn().getResponse().getStatus()).isEqualTo(503);
    }

    @Test
    void writesStayLimitedWhileReadsFailOpen() throws Exception {
        // The read limit is 2 a minute, yet every read passes.
        for (int i = 0; i < 5; i++) {
            assertThat(mvc.perform(get("/brackets").with(remoteAddr("2001:db8:5:5::1"))).andReturn().getResponse().getStatus())
                    .isEqualTo(200);
        }

        // The report limit (2 an hour) still holds, per IPv6 /64: a new address in it gets no new bucket.
        String report = json.writeValueAsString(Map.of("targetType", "bracket", "targetId", 987654321, "reason", "spam"));
        for (String address : List.of("2001:db8:7:7::1", "2001:db8:7:7::2")) {
            assertThat(mvc.perform(post("/reports").with(remoteAddr(address)).contentType(MediaType.APPLICATION_JSON).content(report))
                    .andReturn().getResponse().getStatus()).isEqualTo(404);
        }
        MvcResult limited = mvc.perform(post("/reports").with(remoteAddr("2001:db8:7:7:ffff::3"))
                .contentType(MediaType.APPLICATION_JSON).content(report)).andReturn();
        assertThat(limited.getResponse().getStatus()).isEqualTo(429);
        assertThat(limited.getResponse().getHeader("Retry-After")).isNotBlank();

        // Another network has its own window.
        assertThat(mvc.perform(post("/reports").with(remoteAddr("2001:db8:7:8::1")).contentType(MediaType.APPLICATION_JSON).content(report))
                .andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    private static RequestPostProcessor remoteAddr(String address) {
        return request -> {
            request.setRemoteAddr(address);
            return request;
        };
    }
}
