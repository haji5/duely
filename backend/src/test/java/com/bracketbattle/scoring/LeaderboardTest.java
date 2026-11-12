package com.bracketbattle.scoring;

import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.ItemDto;
import com.bracketbattle.support.SharedFixtures;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** shared/leaderboard-vectors.json and shared/bracket-sizes.json; the frontend checks the same files. */
class LeaderboardTest {

    @Test
    void ordersRowsAsTheVectorsSay() {
        JsonNode vectors = SharedFixtures.read("leaderboard-vectors.json");
        assertThat(Leaderboard.PRIOR_RUNS).isEqualTo(vectors.get("k").asInt());
        List<ItemRankingDto> rows = new ArrayList<>();
        vectors.get("rows").forEach(r -> {
            ItemDto item = new ItemDto(r.get("itemId").asLong(), 1L, "item", "https://images.example.com/x.png", "image");
            long times = r.get("timesRanked").asLong();
            double sum = r.get("scoreSum").asDouble();
            long wins = r.get("wins").asLong();
            long matches = r.get("matches").asLong();
            rows.add(new ItemRankingDto(item, wins, matches, Leaderboard.winPercentage(wins, matches),
                    Leaderboard.adjustedScore(sum, times), sum / times, (int) times));
        });
        rows.sort(Leaderboard.ORDER);

        JsonNode expected = vectors.get("expected");
        assertThat(rows).hasSize(expected.size());
        for (int i = 0; i < rows.size(); i++) {
            ItemRankingDto row = rows.get(i);
            JsonNode e = expected.get(i);
            assertThat(row.getItem().getId()).as("position " + i).isEqualTo(e.get("itemId").asLong());
            assertThat(row.getScore()).isCloseTo(e.get("score").asDouble(), within(1e-12));
            assertThat(row.getAverageScore()).isCloseTo(e.get("averageScore").asDouble(), within(1e-12));
            assertThat(row.getWinPercentage()).isEqualTo(e.get("winPercentage").asInt());
        }
    }

    @Test
    void oneLuckyRunNoLongerBeatsALongRecord() {
        assertThat(Leaderboard.adjustedScore(1.0, 1)).isLessThan(Leaderboard.adjustedScore(465.0, 500));
    }

    @Test
    void bracketSizesMatchTheSharedVectors() {
        SharedFixtures.read("bracket-sizes.json").get("cases").forEach(c -> {
            List<Integer> expected = new ArrayList<>();
            c.get("options").forEach(o -> expected.add(o.asInt()));
            assertThat(BracketSizes.options(c.get("count").asInt())).as("count " + c.get("count")).isEqualTo(expected);
        });
    }
}
