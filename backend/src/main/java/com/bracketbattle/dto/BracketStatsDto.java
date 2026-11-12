package com.bracketbattle.dto;

/**
 * Bracket-wide numbers the per-item rankings can't give: smaller runs play a random subset, so
 * no item's timesRanked equals the number of runs. Plain class so the Valkey cache can round-trip it.
 */
public class BracketStatsDto {
    private long runCount;

    public BracketStatsDto() {}

    public BracketStatsDto(long runCount) {
        this.runCount = runCount;
    }

    /** Runs that count toward the leaderboard, guests' included (the bracket's run_count). */
    public long getRunCount() { return runCount; }
    public void setRunCount(long runCount) { this.runCount = runCount; }
}
