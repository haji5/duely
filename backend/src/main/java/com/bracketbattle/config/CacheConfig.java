package com.bracketbattle.config;

import io.lettuce.core.ClientOptions;
import org.springframework.boot.data.redis.autoconfigure.LettuceClientConfigurationBuilderCustomizer;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.BatchStrategies;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.cache.RedisCacheWriter;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import tools.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import tools.jackson.databind.jsontype.PolymorphicTypeValidator;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Server-side cache in Valkey (Redis-compatible). Entries have absolute TTLs; writes evict the
 * keys they change. If Valkey is unavailable, {@link RedisCacheErrorHandler} turns cache errors
 * into misses and requests are served from Postgres.
 */
@Configuration
@EnableCaching
public class CacheConfig implements CachingConfigurer {

    /** Every cache and its TTL. Unknown cache names fail fast instead of being created on demand. */
    public static final Map<String, Duration> CACHES = Map.of(
            "brackets", Duration.ofMinutes(5),
            "popularBrackets", Duration.ofMinutes(10), // not evicted per run; the TTL bounds staleness
            "bracket", Duration.ofMinutes(30),
            "bracketItems", Duration.ofMinutes(30),
            "bracketRankings", Duration.ofMinutes(10), // evicted on every run
            "bracketComments", Duration.ofMinutes(5),  // evicted on every run
            "userResults", Duration.ofMinutes(10),     // evicted on every run by that user
            "youtubeSearch", Duration.ofHours(24),
            "spotifyPlaylist", Duration.ofHours(1));

    // Bump when the cached JSON shape changes, so old entries are ignored instead of failing to parse.
    private static final String KEY_PREFIX = "duely:v3:";

    private final RedisCacheErrorHandler redisCacheErrorHandler;

    public CacheConfig(RedisCacheErrorHandler redisCacheErrorHandler) {
        this.redisCacheErrorHandler = redisCacheErrorHandler;
    }

    @Override
    public CacheErrorHandler errorHandler() {
        return redisCacheErrorHandler;
    }

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory redisConnectionFactory) {
        GenericJacksonJsonRedisSerializer serializer = GenericJacksonJsonRedisSerializer.builder()
                .enableDefaultTyping(cacheTypeValidator())
                .build();
        RedisCacheConfiguration defaults = RedisCacheConfiguration.defaultCacheConfig()
                .prefixCacheNameWith(KEY_PREFIX)
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(serializer))
                .disableCachingNullValues();

        Map<String, RedisCacheConfiguration> configurations = new HashMap<>();
        CACHES.forEach((name, ttl) -> configurations.put(name, defaults.entryTtl(ttl)));

        // SCAN instead of KEYS when a whole cache is cleared, so Valkey is never blocked.
        RedisCacheWriter writer = RedisCacheWriter.nonLockingRedisCacheWriter(
                redisConnectionFactory, BatchStrategies.scan(1000));
        return RedisCacheManager.builder(writer)
                .cacheDefaults(defaults)
                .withInitialCacheConfigurations(configurations)
                .disableCreateOnMissingCache()
                .build();
    }

    /**
     * Fail fast while Valkey is down: commands are rejected immediately instead of queueing until
     * the command timeout, so a cache outage adds no latency to requests.
     */
    @Bean
    public LettuceClientConfigurationBuilderCustomizer rejectCommandsWhileDisconnected() {
        return builder -> builder.clientOptions(ClientOptions.builder()
                .disconnectedBehavior(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS)
                .build());
    }

    /**
     * The types cached JSON may name. The serializer has its own Jackson mapper (not a bean, so
     * Boot's HTTP mapper is untouched) that writes type information so values round-trip.
     * SECURITY: only our own types and standard JDK value/collection types are allowed. Allowing
     * every subtype of Object would let anyone who can write to Valkey trigger arbitrary-class
     * deserialization gadgets.
     */
    private static PolymorphicTypeValidator cacheTypeValidator() {
        return BasicPolymorphicTypeValidator.builder()
                .allowIfSubType("com.bracketbattle.")
                .allowIfSubType("java.util.")
                .allowIfSubType("java.time.")
                .allowIfSubType("java.lang.")
                .build();
    }
}
