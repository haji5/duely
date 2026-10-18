package com.bracketbattle.advice;

import java.util.Map;

/** A 400 raised by service-level validation, optionally with per-field messages. */
public class InvalidRequestException extends RuntimeException {

    private final Map<String, String> errors;

    public InvalidRequestException(String message) {
        this(message, Map.of());
    }

    public InvalidRequestException(String message, Map<String, String> errors) {
        super(message);
        this.errors = Map.copyOf(errors);
    }

    public Map<String, String> getErrors() {
        return errors;
    }
}
