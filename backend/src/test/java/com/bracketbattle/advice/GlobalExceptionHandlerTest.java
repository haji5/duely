package com.bracketbattle.advice;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.util.Arrays;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void anIllegalArgumentExceptionIsOurBugNotTheClients() {
        ResponseEntity<Map<String, Object>> response =
                handler.handleOther(new IllegalArgumentException("internal detail from a library"));
        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getBody()).containsEntry("message", "An unexpected error occurred");
    }

    @Test
    void noHandlerMapsIllegalArgumentExceptionOnItsOwn() {
        // Such a handler would turn every library bug into a 400 carrying its internal message.
        boolean mapped = Arrays.stream(GlobalExceptionHandler.class.getDeclaredMethods())
                .map(m -> m.getAnnotation(ExceptionHandler.class))
                .filter(a -> a != null)
                .flatMap(a -> Arrays.stream(a.value()))
                .anyMatch(IllegalArgumentException.class::isAssignableFrom);
        assertThat(mapped).isFalse();
    }

    @Test
    void invalidRequestsStayBadRequests() {
        ResponseEntity<Map<String, Object>> response =
                handler.handleInvalidRequest(new InvalidRequestException("Bad run", Map.of("matches", "Bad run")));
        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody()).containsEntry("message", "Bad run");
    }
}
