package com.bracketbattle.security.firebase;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Configuration
public class FirebaseConfig {

    private static final Logger logger = LoggerFactory.getLogger(FirebaseConfig.class);

    @Bean
    public FirebaseAuth firebaseAuth() throws IOException {
        if (FirebaseApp.getApps().isEmpty()) {
            FirebaseOptions.Builder builder = FirebaseOptions.builder();
            String credsPath = System.getenv("GOOGLE_APPLICATION_CREDENTIALS");
            String credsJsonMaybeBase64 = System.getenv("FIREBASE_CREDENTIALS_JSON");

            if (credsJsonMaybeBase64 != null && !credsJsonMaybeBase64.isBlank()) {
                logger.info("Loading Firebase credentials from FIREBASE_CREDENTIALS_JSON");
                byte[] bytes;
                String trimmed = credsJsonMaybeBase64.trim();

                // Check if it looks like JSON (starts with '{')
                if (trimmed.startsWith("{")) {
                    logger.debug("Treating credentials as raw JSON");
                    bytes = trimmed.getBytes(StandardCharsets.UTF_8);
                } else {
                    // Try base64 decoding
                    try {
                        bytes = Base64.getDecoder().decode(trimmed);
                        logger.debug("Successfully decoded base64 credentials, length: {} bytes", bytes.length);
                    } catch (IllegalArgumentException e) {
                        String preview = trimmed.substring(0, Math.min(50, trimmed.length()));
                        logger.error("FIREBASE_CREDENTIALS_JSON is neither valid JSON nor valid base64. First 50 chars: '{}'", preview);
                        logger.error("Please provide either:");
                        logger.error("  1. Raw JSON service account key");
                        logger.error("  2. Base64-encoded JSON service account key");
                        throw new IllegalStateException("FIREBASE_CREDENTIALS_JSON must be valid JSON or base64-encoded JSON. Current value is neither.", e);
                    }
                }

                try (ByteArrayInputStream bais = new ByteArrayInputStream(bytes)) {
                    builder.setCredentials(GoogleCredentials.fromStream(bais));
                } catch (IOException e) {
                    logger.error("Failed to parse Firebase credentials from FIREBASE_CREDENTIALS_JSON. Error: {}", e.getMessage());
                    logger.error("Please ensure FIREBASE_CREDENTIALS_JSON contains valid service account credentials JSON");
                    throw new IllegalStateException("Invalid Firebase credentials in FIREBASE_CREDENTIALS_JSON: " + e.getMessage(), e);
                }
            } else if (credsPath != null && !credsPath.isBlank()) {
                logger.info("Loading Firebase credentials from GOOGLE_APPLICATION_CREDENTIALS: {}", credsPath);
                try (FileInputStream serviceAccount = new FileInputStream(credsPath)) {
                    builder.setCredentials(GoogleCredentials.fromStream(serviceAccount));
                } catch (IOException e) {
                    logger.error("Failed to load Firebase credentials from file: {}. Error: {}", credsPath, e.getMessage());
                    throw new IllegalStateException("Invalid Firebase credentials file at " + credsPath + ": " + e.getMessage(), e);
                }
            } else {
                logger.error("Firebase credentials not found!");
                logger.error("Please set one of the following environment variables:");
                logger.error("  - FIREBASE_CREDENTIALS_JSON (base64-encoded or raw JSON service account key)");
                logger.error("  - GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON file)");
                throw new IllegalStateException("Firebase credentials not configured. Set FIREBASE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS environment variable.");
            }

            FirebaseApp.initializeApp(builder.build());
            logger.info("Firebase initialized successfully");
        }
        return FirebaseAuth.getInstance();
    }
}
