package com.bracketbattle.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired
    private ReadRateLimiterInterceptor readRateLimiterInterceptor;

    @Autowired
    private ReadRateLimitInterceptor readRateLimitInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Add rate limiter for read operations
        registry.addInterceptor(readRateLimiterInterceptor)
                .addPathPatterns("/brackets/**", "/users/**")
                .excludePathPatterns("/actuator/**");

        // Add the read rate limit interceptor for DoS protection
        registry.addInterceptor(readRateLimitInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns("/actuator/health");
    }
}
