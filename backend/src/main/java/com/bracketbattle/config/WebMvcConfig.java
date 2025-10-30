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

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Add rate limiter for read operations (GET requests)
        registry.addInterceptor(readRateLimiterInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns("/actuator/**"); // Exclude all actuator endpoints
    }
}
