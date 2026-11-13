package com.bracketbattle.ratelimit;

import io.lettuce.core.ClientOptions;
import io.lettuce.core.SocketOptions;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.data.redis.autoconfigure.DataRedisConnectionDetails;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * The Valkey that holds the rate-limit counters ({@code app.rate-limit.valkey.*}). In Compose it
 * is its own instance that never evicts, apart from the cache's, which evicts the least recently
 * used keys when full: there, anyone who filled the cache could evict a counter and reset a quota.
 * Without {@code app.rate-limit.valkey.host} ({@code LIMITS_VALKEY_HOST}) it is the cache's instance,
 * taken from the cache's actual connection details (which also covers a Testcontainers service
 * connection, where {@code spring.data.redis.*} is not set).
 *
 * <p>When that instance is full or unreachable, commands fail with a DataAccessException and
 * {@link RateLimiter} counts in memory instead.
 *
 * <p>The connection factory is deliberately not a bean: Spring Boot only auto-configures the
 * cache's connection when no RedisConnectionFactory bean exists, so exposing this one would
 * replace it.
 */
@Component
public class RateLimitStore {

    private final LettuceConnectionFactory connectionFactory;
    private final StringRedisTemplate template;

    public RateLimitStore(@Value("${app.rate-limit.valkey.host:}") String host,
                          @Value("${app.rate-limit.valkey.port:6379}") int port,
                          @Value("${app.rate-limit.valkey.password:}") String password,
                          @Value("${spring.data.redis.timeout:500ms}") Duration commandTimeout,
                          @Value("${spring.data.redis.connect-timeout:500ms}") Duration connectTimeout,
                          DataRedisConnectionDetails cacheConnection) {
        RedisStandaloneConfiguration server = host.isBlank()
                ? sameAsCache(cacheConnection)
                : new RedisStandaloneConfiguration(host, port);
        if (!host.isBlank()) {
            server.setPassword(RedisPassword.of(password));
        }
        // As for the cache (CacheConfig): short timeouts, and commands are rejected at once while
        // disconnected instead of queueing until they time out.
        LettuceClientConfiguration client = LettuceClientConfiguration.builder()
                .commandTimeout(commandTimeout)
                .clientOptions(ClientOptions.builder()
                        .disconnectedBehavior(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS)
                        .socketOptions(SocketOptions.builder().connectTimeout(connectTimeout).build())
                        .build())
                .build();
        connectionFactory = new LettuceConnectionFactory(server, client);
        connectionFactory.afterPropertiesSet();
        connectionFactory.start();
        template = new StringRedisTemplate(connectionFactory);
    }

    private static RedisStandaloneConfiguration sameAsCache(DataRedisConnectionDetails cache) {
        DataRedisConnectionDetails.Standalone standalone = cache.getStandalone();
        if (standalone == null) {
            throw new IllegalStateException("The cache's Valkey is not a single instance: set LIMITS_VALKEY_HOST");
        }
        RedisStandaloneConfiguration server = new RedisStandaloneConfiguration(standalone.getHost(), standalone.getPort());
        server.setDatabase(standalone.getDatabase());
        server.setUsername(cache.getUsername());
        server.setPassword(RedisPassword.of(cache.getPassword()));
        return server;
    }

    public StringRedisTemplate template() {
        return template;
    }

    @PreDestroy
    void close() {
        connectionFactory.destroy();
    }
}
