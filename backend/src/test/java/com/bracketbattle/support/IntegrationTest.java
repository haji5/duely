package com.bracketbattle.support;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.bracketbattle.media.UpstreamGuard;
import com.bracketbattle.service.RunTickets;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
 * fake tokens {@link #USER_A}, {@link #USER_B}, {@link #USER_C} and {@link #ADMIN}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(FakeDnsConfig.class)
public abstract class IntegrationTest {

    public static final String USER_A = "token-a";
    public static final String USER_B = "token-b";
    public static final String ADMIN = "token-admin";
    /** A user no other test touches, for assertions over a user's whole history. */
    public static final String USER_C = "token-c";

    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:15-alpine");

    @ServiceConnection(name = "redis")
    static final GenericContainer<?> VALKEY = new GenericContainer<>("valkey/valkey:8-alpine").withExposedPorts(6379);

    static {
        POSTGRES.start();
        VALKEY.start();
    }

    @MockitoBean
    protected FirebaseAuth firebaseAuth;

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected StringRedisTemplate redis;

    @Autowired
    protected RunTickets runTickets;

    @Autowired
    private JdbcTemplate baseJdbc;

    @Autowired
    protected FakeUpstreamHttp upstream;

    @Autowired
    private UpstreamGuard upstreamGuard;

    private final Map<String, String> ticketsByToken = new HashMap<>();

    @BeforeEach
    void resetValkeyAndTokens() throws Exception {
        redis.execute((org.springframework.data.redis.core.RedisCallback<Void>) c -> {
            c.serverCommands().flushAll();
            return null;
        });
        upstream.reset();
        upstreamGuard.reset();
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
        payload.put("category", "Technology");
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
     * A run payload for a ranking, with a real signed ticket for exactly those entries (looked up
     * from the first item's bracket) and matches that produce that ranking (see
     * {@link #knockoutMatches}). The same {@code token} gives the same ticket within a test, so
     * a retry is a resubmission of the same run; null always starts a new run. Tickets are dated
     * an hour back, as if the run had been played at a human pace.
     */
    protected Map<String, Object> runPayload(List<Long> ranking, String token, String comment) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ticket", token == null ? ticketFor(ranking) : ticketsByToken.computeIfAbsent(token, t -> ticketFor(ranking)));
        payload.put("matches", knockoutMatches(ranking));
        if (comment != null) {
            payload.put("comment", comment);
            payload.put("displayName", "Tester");
        }
        return payload;
    }

    /** A ticket for these entries, issued an hour ago. */
    protected String ticketFor(List<Long> entrants) {
        List<Long> brackets = baseJdbc.queryForList("SELECT bracket_id FROM items WHERE id = ?", Long.class, entrants.get(0));
        long bracketId = brackets.isEmpty() ? -1 : brackets.get(0);
        return runTickets.issue(bracketId, entrants, Instant.now().minus(Duration.ofHours(1)));
    }

    /**
     * Matches, in the order played, of a knockout whose result is {@code ranking}: the item at
     * position p (0-based, p >= 1) lost to the item at p - highestOneBit(p), and earlier rounds
     * (larger p) come first. For a power-of-two field this is a full bracket; for other sizes the
     * top seeds simply had byes.
     */
    protected static List<Map<String, Long>> knockoutMatches(List<Long> ranking) {
        List<Map<String, Long>> matches = new ArrayList<>();
        for (int p = ranking.size() - 1; p >= 1; p--) {
            int winner = p - Integer.highestOneBit(p);
            matches.add(Map.of("winnerId", ranking.get(winner), "loserId", ranking.get(p)));
        }
        return matches;
    }

    /** Starts a run through the API and returns the response. */
    protected JsonNode startRun(String token, long bracketId, int size) throws Exception {
        MvcResult result = perform(as(token, postJson("/brackets/" + bracketId + "/runs", Map.of("size", size))));
        if (result.getResponse().getStatus() != 200) {
            throw new AssertionError("start failed: " + result.getResponse().getContentAsString());
        }
        return body(result);
    }
}
