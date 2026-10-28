package com.bracketbattle.service;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.model.MatchOutcome;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ValidateRunTest {

    private static final Set<Long> ITEMS = Set.of(1L, 2L, 3L, 4L, 5L);

    private static MatchOutcome m(long w, long l) {
        return new MatchOutcome(w, l);
    }

    @Test
    void acceptsAFullKnockout() {
        assertThatCode(() -> BracketService.validateRun(List.of(1L, 2L, 3L, 4L),
                List.of(m(1, 3), m(2, 4), m(1, 2)), ITEMS)).doesNotThrowAnyException();
    }

    @Test
    void acceptsAByeBracketOfFive() {
        // 5 entries at size 8: three byes, so only 4 real matches
        assertThatCode(() -> BracketService.validateRun(List.of(1L, 2L, 3L, 4L, 5L),
                List.of(m(4, 5), m(1, 4), m(2, 3), m(1, 2)), ITEMS)).doesNotThrowAnyException();
    }

    @Test
    void rejectsBrokenRuns() {
        assertInvalid(List.of(1L), List.of(), "between 2");
        assertInvalid(List.of(1L, 1L), List.of(m(1, 1)), "more than once");
        assertInvalid(List.of(1L, 9L), List.of(m(1, 9)), "does not belong");
        assertInvalid(List.of(1L, 2L, 3L), List.of(m(1, 2)), "exactly 2 matches");
        assertInvalid(List.of(1L, 2L), List.of(m(2, 1)), "champion");
        assertInvalid(List.of(1L, 2L), List.of(m(1, 3)), "ranked items");
        assertInvalid(List.of(1L, 2L, 3L), List.of(m(1, 2), m(3, 2)), "loses more than once");
        assertInvalid(List.of(1L, 2L, 3L), List.of(m(2, 3), m(3, 2)), "play each other twice");
        assertInvalid(List.of(1L, 2L, 3L), List.of(m(1, 2), m(3, 1)), "champion");
        // The runner-up beat by a round-one loser is not a knockout result
        assertInvalid(List.of(1L, 2L, 3L, 4L), List.of(m(1, 3), m(4, 2), m(1, 4)), "ranked below");
    }

    @Test
    void rejectsACycleThatLeavesTheChampionOut() {
        // Each of 2, 3, 4 loses exactly once, but in a loop; the champion never plays.
        assertInvalid(List.of(1L, 2L, 3L, 4L), List.of(m(2, 3), m(3, 4), m(4, 2)), "ranked below");
    }

    @Test
    void rejectsAChampionWithMoreWinsThanAKnockoutHasRounds() {
        // Four entries make a two-round bracket, so nobody can win three matches. A "star" where
        // the champion beats everyone passes the per-match rules but inflates its stats.
        assertInvalid(List.of(1L, 2L, 3L, 4L), List.of(m(1, 2), m(1, 3), m(1, 4)), "wins");
        // Five entries (size 8 with byes) have three rounds, so three wins is fine there
        assertThatCode(() -> BracketService.validateRun(List.of(1L, 2L, 3L, 4L, 5L),
                List.of(m(1, 5), m(1, 4), m(2, 3), m(1, 2)), ITEMS)).doesNotThrowAnyException();
    }

    @Test
    void rejectsOversizedRankings() {
        List<Long> ranking = LongStream.rangeClosed(1, BracketService.MAX_ITEMS + 1).boxed().toList();
        assertThatThrownBy(() -> BracketService.validateRun(ranking, List.of(), new HashSet<>(ranking)))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining("between 2");
    }

    @Test
    void acceptsAPartialRunOfABiggerBracket() {
        assertThatCode(() -> BracketService.validateRun(List.of(5L, 2L), List.of(m(5, 2)), ITEMS))
                .doesNotThrowAnyException();
    }

    private static void assertInvalid(List<Long> ranking, List<MatchOutcome> matches, String message) {
        assertThatThrownBy(() -> BracketService.validateRun(ranking, matches, ITEMS))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining(message);
    }
}
