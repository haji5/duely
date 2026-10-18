package com.bracketbattle;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

// No username/password users: Firebase bearer tokens are the only authentication.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class BracketBattleApplication {

    public static void main(String[] args) {
        SpringApplication.run(BracketBattleApplication.class, args);
    }
}
