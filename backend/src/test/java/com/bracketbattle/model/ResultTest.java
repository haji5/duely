package com.bracketbattle.model;

import com.bracketbattle.dto.CommentDto;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ResultTest {

    @Test
    void rankingAndMatchesRoundTripThroughTheirJsonColumns() {
        Result result = new Result(1L, "uid", List.of(3L, 1L, 2L),
                List.of(new MatchOutcome(3L, 2L), new MatchOutcome(3L, 1L)), "token");
        assertThat(result.getRanking()).containsExactly(3L, 1L, 2L);
        assertThat(result.getMatches()).containsExactly(new MatchOutcome(3L, 2L), new MatchOutcome(3L, 1L));
    }

    @Test
    void legacyRunsKeepNullMatchesAndAnEmptyRankingIsMutable() {
        Result result = new Result(1L, null, null, null, "token");
        assertThat(result.getMatches()).isNull();
        assertThat(result.getRanking()).isEmpty();
        assertThat(result.getRanking()).isInstanceOf(ArrayList.class);
    }

    @Test
    void largeIdsSurviveTheJsonColumn() {
        long big = Long.MAX_VALUE - 1;
        Result result = new Result(1L, null, List.of(big, 1L), List.of(new MatchOutcome(big, 1L)), "token");
        assertThat(result.getRanking()).containsExactly(big, 1L);
        assertThat(result.getMatches().get(0).winnerId()).isEqualTo(big);
    }

    @Test
    void corruptJsonIsReportedNotSwallowed() {
        Result result = new Result();
        ReflectionTestUtils.setField(result, "rankingJson", "[1,");
        assertThatThrownBy(result::getRanking).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void commentChampionIsTheFirstRankedItem() {
        Result result = new Result(1L, null, List.of(7L, 8L), List.of(new MatchOutcome(7L, 8L)), "token");
        result.setComment("hi");
        assertThat(CommentDto.from(result).getChampionItemId()).isEqualTo(7L);
        assertThat(CommentDto.from(new Result(1L, null, List.of(), null, "t")).getChampionItemId()).isNull();
    }
}
