package com.bracketbattle.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Turns on {@code @Scheduled} methods (RunPruner). Their schedules are properties that tests switch off. */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
