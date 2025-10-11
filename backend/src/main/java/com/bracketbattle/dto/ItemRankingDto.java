package com.bracketbattle.dto;

import com.bracketbattle.model.Item;

public class ItemRankingDto {
    private Item item;
    private int wins;
    private int totalMatches;
    private int winPercentage;
    private double averageScore;
    private int timesRanked;

    public ItemRankingDto() {}

    public ItemRankingDto(Item item, int wins, int totalMatches, int winPercentage, double averageScore, int timesRanked) {
        this.item = item;
        this.wins = wins;
        this.totalMatches = totalMatches;
        this.winPercentage = winPercentage;
        this.averageScore = averageScore;
        this.timesRanked = timesRanked;
    }

    // Getters and setters
    public Item getItem() {
        return item;
    }

    public void setItem(Item item) {
        this.item = item;
    }

    public int getWins() {
        return wins;
    }

    public void setWins(int wins) {
        this.wins = wins;
    }

    public int getTotalMatches() {
        return totalMatches;
    }

    public void setTotalMatches(int totalMatches) {
        this.totalMatches = totalMatches;
    }

    public int getWinPercentage() {
        return winPercentage;
    }

    public void setWinPercentage(int winPercentage) {
        this.winPercentage = winPercentage;
    }

    public double getAverageScore() {
        return averageScore;
    }

    public void setAverageScore(double averageScore) {
        this.averageScore = averageScore;
    }

    public int getTimesRanked() {
        return timesRanked;
    }

    public void setTimesRanked(int timesRanked) {
        this.timesRanked = timesRanked;
    }
}

