package com.bracketbattle.support;

import com.bracketbattle.media.HostResolver;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Base for tests against the real stack: Postgres and Valkey in Testcontainers (started once per
 * JVM and shared by every Spring context), MockMvc, and a mocked FirebaseAuth that accepts the
 * fake tokens {@link #USER_A}, {@link #USER_B} and {@link #ADMIN}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(IntegrationTest.FakeDns.class)
public abstract class IntegrationTest {

    public static final String USER_A = "token-a";
    public static final String USER_B = "token-b";
    public static final String ADMIN = "token-admin";
    /** A user no other test touches, for assertions over a user's whole history. */
    public static final String USER_C = "token-c";

    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine");

    @ServiceConnection(name = "redis")
    static final GenericContainer<?> VALKEY = new GenericContainer<>("valkey/valkey:8-alpine").withExposedPorts(6379);

    static {
        POSTGRES.start();
        VALKEY.start();
    }

    @MockBean
    protected FirebaseAuth firebaseAuth;

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected StringRedisTemplate redis;

    @BeforeEach
    void resetValkeyAndTokens() throws Exception {
        redis.execute((org.springframework.data.redis.core.RedisCallback<Void>) c -> {
            c.serverCommands().flushAll();
            return null;
        });
        doThrow(new IllegalArgumentException("invalid token")).when(firebaseAuth).verifyIdToken(anyString());
        stubToken(USER_A, "uid-a", Map.of());
        stubToken(USER_B, "uid-b", Map.of());
        stubToken(USER_C, "uid-c", Map.of());
        stubToken(ADMIN, "uid-admin", Map.of("admin", true));
    }

    private void stubToken(String token, String uid, Map<String, Object> claims) throws Exception {
        FirebaseToken decoded = mock(FirebaseToken.class);
        when(decoded.getUid()).thenReturn(uid);
        when(decoded.getClaims()).thenReturn(claims);
        doReturn(decoded).when(firebaseAuth).verifyIdToken(token);
    }

    /** Resolves every name to a public address, except hosts that name a private or missing one. */
    @TestConfiguration
    static class FakeDns {
        @Bean
        @Primary
        HostResolver fakeHostResolver() {
            return host -> {
                if (host.contains("nxdomain")) throw new UnknownHostException(host);
                String ip = host.contains("private") ? "10.0.0.7" : "93.184.216.34";
                return new InetAddress[]{InetAddress.getByName(ip)};
            };
        }
    }

    // ---- helpers ---------------------------------------------------------------------------

    protected static MockHttpServletRequestBuilder as(String token, MockHttpServletRequestBuilder builder) {
        return token == null ? builder : builder.header("Authorization", "Bearer " + token);
    }

    protected MvcResult perform(MockHttpServletRequestBuilder builder) throws Exception {
        return mvc.perform(builder).andReturn();
    }

    protected JsonNode body(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString());
    }

    protected MockHttpServletRequestBuilder postJson(String path, Object body) throws Exception {
        return post(path).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }

    protected static Map<String, Object> bracketPayload(String name, String type, int itemCount) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < itemCount; i++) {
            String url = switch (type) {
                case "video" -> "https://www.youtube.com/watch?v=" + String.format("vid%08d", i);
                case "song" -> "https://open.spotify.com/track/" + "trk" + i;
                default -> "https://images.example.com/" + i + ".png";
            };
            items.add(Map.of("title", "Item " + i, "mediaUrl", url));
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", name);
        payload.put("description", "A test bracket");
        payload.put("type", type);
        payload.put("category", "Testing");
        payload.put("items", items);
        return payload;
    }

    /** Creates a bracket as {@code token} and returns its JSON. */
    protected JsonNode createBracket(String token, String name, int itemCount) throws Exception {
        MvcResult result = perform(as(token, postJson("/brackets", bracketPayload(name, "image", itemCount))));
        if (result.getResponse().getStatus() != 200) {
            throw new AssertionError("create failed: " + result.getResponse().getContentAsString());
        }
        return body(result);
    }

    protected List<Long> itemIds(long bracketId) throws Exception {
        JsonNode items = body(perform(get("/brackets/" + bracketId + "/items")));
        List<Long> ids = new ArrayList<>();
        items.forEach(i -> ids.add(i.get("id").asLong()));
        return ids;
    }

    /**
     * A run payload for a ranking played as a single-elimination tournament without byes, where
     * the higher-ranked item wins: the matches are derived from a standard bracket over the
     * ranking order. Only valid for power-of-two sizes.
     */
    protected static Map<String, Object> runPayload(List<Long> ranking, String token, String comment) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ranking", ranking);
        payload.put("matches", knockoutMatches(ranking));
        payload.put("submissionToken", token != null ? token : UUID.randomUUID().toString());
        if (comment != null) {
            payload.put("comment", comment);
            payload.put("displayName", "Tester");
        }
        return payload;
    }

    /**
     * Matches consistent with {@code ranking} for a power-of-two field: champion beats runner-up in
     * the final, the two semifinal losers lost to the finalists, and so on. Item at position p
     * (0-based, p >= 1) lost to the item at position p - highestOneBit(p).
     */
    protected static List<Map<String, Long>> knockoutMatches(List<Long> ranking) {
        List<Map<String, Long>> matches = new ArrayList<>();
        for (int p = 1; p < ranking.size(); p++) {
            int winner = p - Integer.highestOneBit(p);
            matches.add(Map.of("winnerId", ranking.get(winner), "loserId", ranking.get(p)));
        }
        return matches;
    }
}
