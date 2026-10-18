package com.bracketbattle.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** With Valkey unreachable the app must still start and serve from Postgres, without long stalls. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(IntegrationTest.FakeDns.class)
class ValkeyDownIT {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTest.POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", IntegrationTest.POSTGRES::getUsername);
        registry.add("spring.datasource.password", IntegrationTest.POSTGRES::getPassword);
        registry.add("spring.data.redis.host", () -> "127.0.0.1");
        registry.add("spring.data.redis.port", () -> "1"); // nothing listens here
    }

    @MockBean
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

        // Guest submission still works: rate limiting fails open, cache evictions are skipped.
        MvcResult missing = mvc.perform(post("/brackets/987654321/results").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("ranking", List.of(1, 2),
                        "matches", List.of(Map.of("winnerId", 1, "loserId", 2)), "submissionToken", "t")))).andReturn();
        assertThat(missing.getResponse().getStatus()).isEqualTo(404);
        assertThat((System.nanoTime() - start) / 1_000_000).as("ms for three requests").isLessThan(5000);

        // Readiness ignores Valkey; the overall health shows it as down.
        assertThat(mvc.perform(get("/actuator/health/readiness")).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(mvc.perform(get("/actuator/health")).andReturn().getResponse().getStatus()).isEqualTo(503);
    }
}
