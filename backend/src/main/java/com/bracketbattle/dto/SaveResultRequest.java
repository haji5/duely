package com.bracketbattle.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

public class SaveResultRequest {

    @NotNull
    @NotEmpty
    private List<@NotNull @Positive Long> ranking;

    @NotNull
    private String submissionToken;

    public List<Long> getRanking() { return ranking; }
    public void setRanking(List<Long> ranking) { this.ranking = ranking; }

    public String getSubmissionToken() { return submissionToken; }
    public void setSubmissionToken(String submissionToken) { this.submissionToken = submissionToken; }
}
