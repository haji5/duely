package com.bracketbattle.scoring;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.model.MatchOutcome;
import com.bracketbattle.support.SharedFixtures;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** The cases in shared/run-scoring-vectors.json; rankings.test.ts checks the same file. */
class RunScoringTest {

    private static final JsonNode VECTORS = SharedFixtures.read("run-scoring-vectors.json");

    private static List<MatchOutcome> matches(JsonNode node) {
        List<MatchOutcome> out = new ArrayList<>();
        node.forEach(m -> out.add(new MatchOutcome(m.get("winnerId").asLong(), m.get("loserId").asLong())));
        return out;
    }

    @TestFactory
    Stream<DynamicTest> validRunsScoreAsTheVectorsSay() {
        List<DynamicTest> tests = new ArrayList<>();
        VECTORS.get("valid").forEach(c -> tests.add(DynamicTest.dynamicTest(c.get("name").asString(), () -> {
            RunScoring.Scored scored = RunScoring.score(matches(c.get("matches")));
            List<Long> ranking = new ArrayList<>();
            c.get("ranking").forEach(id -> ranking.add(id.asLong()));
            assertThat(scored.ranking()).containsExactlyElementsOf(ranking);
            for (Long id : ranking) {
                RunScoring.Standing s = scored.standings().get(id);
                String key = Long.toString(id);
                assertThat(s.depth()).as("depth of " + id).isEqualTo(c.get("depths").get(key).asInt());
                assertThat(s.placeFrom()).as("place of " + id).isEqualTo(c.get("places").get(key).get("from").asInt());
                assertThat(s.placeTo()).isEqualTo(c.get("places").get(key).get("to").asInt());
                assertThat(s.score()).as("score of " + id).isCloseTo(c.get("scores").get(key).asDouble(), within(1e-12));
            }
        })));
        return tests.stream();
    }

    @TestFactory
    Stream<DynamicTest> invalidRunsAreRejected() {
        List<DynamicTest> tests = new ArrayList<>();
        VECTORS.get("invalid").forEach(c -> tests.add(DynamicTest.dynamicTest(c.get("name").asString(), () ->
                assertThatThrownBy(() -> RunScoring.score(matches(c.get("matches"))))
                        .isInstanceOf(InvalidRequestException.class))));
        return tests.stream();
    }

    @Test
    void firstRoundLosersOfAnEightEntryRunShareOneScore() {
        JsonNode eight = null;
        for (JsonNode c : VECTORS.get("valid")) {
            if (c.get("matches").size() == 7) eight = c;
        }
        assertThat(eight).isNotNull();
        RunScoring.Scored scored = RunScoring.score(matches(eight.get("matches")));
        List<Double> firstRound = scored.standings().values().stream()
                .filter(s -> s.depth() == 3).map(RunScoring.Standing::score).toList();
        assertThat(firstRound).hasSize(4).containsOnly((7 - 5.5) / 7);
    }

    @Test
    void legacyRunsKeepTheirListPositions() {
        RunScoring.Scored scored = RunScoring.legacy(List.of(5L, 6L, 7L));
        assertThat(scored.standings().get(5L).score()).isEqualTo(1.0);
        assertThat(scored.standings().get(6L).score()).isEqualTo(0.5);
        assertThat(scored.standings().get(7L).placeFrom()).isEqualTo(3);
    }

    @Test
    void roundsIsCeilLog2() {
        assertThat(RunScoring.rounds(2)).isEqualTo(1);
        assertThat(RunScoring.rounds(3)).isEqualTo(2);
        assertThat(RunScoring.rounds(8)).isEqualTo(3);
        assertThat(RunScoring.rounds(9)).isEqualTo(4);
        assertThat(RunScoring.rounds(500)).isEqualTo(9);
    }
}
