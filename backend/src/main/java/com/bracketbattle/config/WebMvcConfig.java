package com.bracketbattle.config;

import com.bracketbattle.ratelimit.ReadRateLimitInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final ReadRateLimitInterceptor readRateLimitInterceptor;

    public WebMvcConfig(ReadRateLimitInterceptor readRateLimitInterceptor) {
        this.readRateLimitInterceptor = readRateLimitInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Metadata lookups have their own per-user buckets; actuator is not an MVC handler.
        registry.addInterceptor(readRateLimitInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns("/actuator/**", "/metadata/**");
    }
}
