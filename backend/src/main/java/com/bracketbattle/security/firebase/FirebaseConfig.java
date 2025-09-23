package com.bracketbattle.security.firebase;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Configuration
public class FirebaseConfig {

    @Bean
    public FirebaseAuth firebaseAuth() throws IOException {
        if (FirebaseApp.getApps().isEmpty()) {
            FirebaseOptions.Builder builder = FirebaseOptions.builder();
            String credsPath = System.getenv("GOOGLE_APPLICATION_CREDENTIALS");
            String credsJsonMaybeBase64 = System.getenv("FIREBASE_CREDENTIALS_JSON");

            if (credsJsonMaybeBase64 != null && !credsJsonMaybeBase64.isBlank()) {
                byte[] bytes;
                String trimmed = credsJsonMaybeBase64.trim();
                try {
                    // Try base64 first
                    bytes = Base64.getDecoder().decode(trimmed);
                } catch (IllegalArgumentException e) {
                    // Fallback: treat as raw JSON
                    bytes = trimmed.getBytes(StandardCharsets.UTF_8);
                }
                try (ByteArrayInputStream bais = new ByteArrayInputStream(bytes)) {
                    builder.setCredentials(GoogleCredentials.fromStream(bais));
                }
            } else if (credsPath != null && !credsPath.isBlank()) {
                try (FileInputStream serviceAccount = new FileInputStream(credsPath)) {
                    builder.setCredentials(GoogleCredentials.fromStream(serviceAccount));
                }
            } else {
                builder.setCredentials(GoogleCredentials.getApplicationDefault());
            }

            FirebaseApp.initializeApp(builder.build());
        }
        return FirebaseAuth.getInstance();
    }
}
