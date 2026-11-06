package com.bracketbattle.dto;

import com.bracketbattle.model.MatchOutcome;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ValidationOrderTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private static List<String> paths(Set<? extends ConstraintViolation<?>> violations) {
        return violations.stream().map(v -> v.getPropertyPath().toString()).sorted().toList();
    }

    @Test
    void oversizedListsStopBeforeTheirElementsAreChecked() {
        var run = new SaveResultRequest(Collections.nCopies(5000, 0L),
                Collections.nCopies(5000, new MatchOutcome(null, null)), "tok", null, null);
        assertThat(paths(validator.validate(run, ValidationOrder.class))).containsExactly("matches", "ranking");

        var bracket = new CreateBracketRequest("Name", null, "image", null,
                Collections.nCopies(2000, new CreateBracketRequest.NewItemRequest(null, null)));
        assertThat(paths(validator.validate(bracket, ValidationOrder.class))).containsExactly("items");
    }

    @Test
    void elementsAreCheckedOnceTheFieldsPass() {
        var run = new SaveResultRequest(List.of(0L, -1L), List.of(new MatchOutcome(null, 2L)), "tok", null, null);
        assertThat(paths(validator.validate(run, ValidationOrder.class)))
                .containsExactly("matches[0].winnerId", "ranking[0].<list element>", "ranking[1].<list element>");
    }

    @Test
    void allFieldErrorsAreReportedTogether() {
        var bracket = new CreateBracketRequest("x".repeat(101), null, "gif", null,
                List.of(new CreateBracketRequest.NewItemRequest("t", "https://images.example.com/1.png")));
        assertThat(paths(validator.validate(bracket, ValidationOrder.class))).containsExactly("items", "name", "type");
    }

    @Test
    void aPlainValidStillEnforcesEveryConstraint() {
        var run = new SaveResultRequest(List.of(5L), List.of(), " ", "x".repeat(101), null);
        assertThat(paths(validator.validate(run))).containsExactly("displayName", "ranking", "submissionToken");

        var elements = new SaveResultRequest(List.of(0L, 1L), List.of(), "tok", null, null);
        assertThat(paths(validator.validate(elements))).containsExactly("ranking[0].<list element>");
    }
}
