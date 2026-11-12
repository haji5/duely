package com.bracketbattle.support;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Reads files from the repository's shared/ directory: test vectors for rules the frontend
 * mirrors, so both test suites check the same cases and the two implementations cannot drift.
 */
public final class SharedFixtures {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private SharedFixtures() {}

    public static JsonNode read(String name) {
        // Maven runs tests from backend/, so shared/ is one level up.
        Path path = Path.of("..", "shared", name);
        try {
            return JSON.readTree(Files.readString(path));
        } catch (IOException e) {
            throw new UncheckedIOException("Missing shared fixture " + path.toAbsolutePath(), e);
        }
    }
}
