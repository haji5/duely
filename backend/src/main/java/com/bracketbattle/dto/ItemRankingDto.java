package com.bracketbattle.dto;

import com.bracketbattle.model.Item;

/**
 * One leaderboard row. A plain class rather than a record: the Valkey cache serialiser only
 * writes type information for non-final classes.
 */
public class ItemRankingDto {
    private Item item;
    private long wins;
    private long totalMatches;
    private int winPercentage;
    private double averageScore;
    private int timesRanked;

    public ItemRankingDto() {}

    public ItemRankingDto(Item item, long wins, long totalMatches, int winPercentage, double averageScore, int timesRanked) {
        this.item = item;
        this.wins = wins;
        this.totalMatches = totalMatches;
        this.winPercentage = winPercentage;
        this.averageScore = averageScore;
        this.timesRanked = timesRanked;
    }

    public Item getItem() { return item; }
    public void setItem(Item item) { this.item = item; }

    public long getWins() { return wins; }
    public void setWins(long wins) { this.wins = wins; }

    public long getTotalMatches() { return totalMatches; }
    public void setTotalMatches(long totalMatches) { this.totalMatches = totalMatches; }

    /** Share of real head-to-head matches won, 0-100. */
    public int getWinPercentage() { return winPercentage; }
    public void setWinPercentage(int winPercentage) { this.winPercentage = winPercentage; }

    /** Mean normalised finishing position, 0..1 (1 = champion every time). */
    public double getAverageScore() { return averageScore; }
    public void setAverageScore(double averageScore) { this.averageScore = averageScore; }

    public int getTimesRanked() { return timesRanked; }
    public void setTimesRanked(int timesRanked) { this.timesRanked = timesRanked; }
}
