package com.bracketbattle.advice;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Maps exceptions to {@code {timestamp, status, error, message, errors?}} with the right status.
 * Only genuinely unexpected exceptions become 500s and are logged at ERROR.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            errors.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        String message = errors.isEmpty() ? "Validation failed" : errors.values().iterator().next();
        return body(HttpStatus.BAD_REQUEST, message, errors, null);
    }

    @ExceptionHandler(InvalidRequestException.class)
    public ResponseEntity<Map<String, Object>> handleInvalidRequest(InvalidRequestException ex) {
        return body(HttpStatus.BAD_REQUEST, ex.getMessage(), ex.getErrors(), null);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException ex) {
        return body(HttpStatus.BAD_REQUEST, "Malformed request body", null, null);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return body(HttpStatus.BAD_REQUEST, "Invalid value for '" + ex.getName() + "'", null, null);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        return body(HttpStatus.BAD_REQUEST, ex.getMessage(), null, null);
    }

    /** From @PreAuthorize. Anonymous callers never get here: the filter chain answers 401 first. */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        return body(HttpStatus.FORBIDDEN, "You do not have permission to do this", null, null);
    }

    /**
     * Exceptions that carry their own status (ResponseStatusException, unknown routes, 405, 415,
     * missing parameters, ...) keep it. Everything else is unexpected: log it and answer 500.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception ex) {
        if (ex instanceof ErrorResponse er) {
            String detail = er.getBody().getDetail();
            return body(er.getStatusCode(), detail != null ? detail : ex.getMessage(), null, er.getHeaders());
        }
        log.error("Unexpected error", ex);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred", null, null);
    }

    private static ResponseEntity<Map<String, Object>> body(HttpStatusCode status, String message,
                                                            Map<String, String> errors, HttpHeaders headers) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        HttpStatus known = HttpStatus.resolve(status.value());
        body.put("error", known != null ? known.getReasonPhrase() : "Error");
        body.put("message", message);
        if (errors != null && !errors.isEmpty()) {
            body.put("errors", errors);
        }
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(status);
        if (headers != null) {
            builder.headers(headers);
        }
        return builder.body(body);
    }
}
