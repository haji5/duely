package com.bracketbattle.repository;

import com.bracketbattle.model.MatchOutcome;
import com.bracketbattle.scoring.Leaderboard;
import com.bracketbattle.scoring.RunScoring;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ItemStatsDeltasTest {

    @Test
    void legacyPositionScoreIsNormalisedSoRunSizesCompare() {
        Map<Long, ItemStatsRepository.Delta> eight = legacy(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L));
        Map<Long, ItemStatsRepository.Delta> two = legacy(List.of(9L, 10L));

        assertThat(eight.get(1L).score()).isEqualTo(1.0);
        assertThat(eight.get(8L).score()).isEqualTo(0.0);
        assertThat(eight.get(5L).score()).isCloseTo(3.0 / 7, within(1e-12));
        assertThat(two.get(9L).score()).isEqualTo(1.0);
        assertThat(two.get(10L).score()).isEqualTo(0.0);
        // Old formula gave the 8-run's 5th place (4 points) more than the 2-run champion (2 points)
        assertThat(eight.get(5L).score()).isLessThan(two.get(9L).score());
    }

    @Test
    void scoresComeFromTiersAndWinsFromRealMatches() {
        List<MatchOutcome> matches = List.of(new MatchOutcome(1L, 3L), new MatchOutcome(2L, 4L), new MatchOutcome(1L, 2L));

        Map<Long, ItemStatsRepository.Delta> d = ItemStatsRepository.deltas(RunScoring.score(matches), matches);

        assertThat(d.get(1L)).isEqualTo(new ItemStatsRepository.Delta(1.0, 2, 2));
        assertThat(d.get(2L).score()).isEqualTo(2.0 / 3);
        // Both semifinal losers did the same, so they score the same.
        assertThat(d.get(3L).score()).isEqualTo(1.0 / 6).isEqualTo(d.get(4L).score());
        assertThat(d.get(2L).wins()).isEqualTo(1);
        assertThat(d.get(2L).matches()).isEqualTo(2);
        assertThat(d.get(3L).wins()).isZero();
        assertThat(d.get(3L).matches()).isEqualTo(1);
        assertThat(d.get(4L).matches()).isEqualTo(1);
    }

    @Test
    void legacyRunsFallBackToPosition() {
        Map<Long, ItemStatsRepository.Delta> d = legacy(List.of(5L, 6L, 7L));
        assertThat(d.get(5L)).isEqualTo(new ItemStatsRepository.Delta(1.0, 2, 2));
        assertThat(d.get(6L)).isEqualTo(new ItemStatsRepository.Delta(0.5, 1, 2));
        assertThat(d.get(7L)).isEqualTo(new ItemStatsRepository.Delta(0.0, 0, 2));
    }

    @Test
    void deltasAreOrderedByItemIdForLockOrdering() {
        Map<Long, ItemStatsRepository.Delta> d = legacy(List.of(30L, 10L, 20L));
        assertThat(d.keySet()).containsExactly(10L, 20L, 30L);
    }

    @Test
    void winPercentageRounds() {
        assertThat(Leaderboard.winPercentage(2, 3)).isEqualTo(67);
        assertThat(Leaderboard.winPercentage(0, 0)).isZero();
    }

    private static Map<Long, ItemStatsRepository.Delta> legacy(List<Long> ranking) {
        return ItemStatsRepository.deltas(RunScoring.legacy(ranking), null);
    }
}
