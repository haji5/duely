package com.bracketbattle.config;

import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration for Redisson distributed lock client.
 * Used to prevent cache stampede in high-traffic scenarios.
 * Valkey is Redis-compatible, so Redisson works seamlessly.
 */
@Configuration
public class RedissonConfig {

    @Value("${spring.data.redis.host:localhost}")
    private String valkeyHost;

    @Value("${spring.data.redis.port:6379}")
    private int valkeyPort;

    @Value("${spring.data.redis.password:}")
    private String valkeyPassword;

    @Bean
    public RedissonClient redissonClient() {
        Config config = new Config();

        String address = "redis://" + valkeyHost + ":" + valkeyPort;

        config.useSingleServer()
                .setAddress(address)
                .setPassword(valkeyPassword.isEmpty() ? null : valkeyPassword)
                .setConnectionPoolSize(30)
                .setConnectionMinimumIdleSize(10)
                .setTimeout(3000)
                .setRetryAttempts(3)
                .setRetryInterval(1500)
                // Use database 0 (same as Spring Data Redis by default)
                .setDatabase(0);

        return Redisson.create(config);
    }
}
