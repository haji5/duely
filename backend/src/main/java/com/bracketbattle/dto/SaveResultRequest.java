package com.bracketbattle.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public class SaveResultRequest {

    @NotNull
    @NotEmpty
    @Size(max = 500, message = "Ranking cannot exceed 500 items")
    private List<@NotNull @Positive Long> ranking;

    @NotNull
    @Size(max = 255, message = "Submission token too long")
    private String submissionToken;

    public List<Long> getRanking() { return ranking; }
    public void setRanking(List<Long> ranking) { this.ranking = ranking; }

    public String getSubmissionToken() { return submissionToken; }
    public void setSubmissionToken(String submissionToken) { this.submissionToken = submissionToken; }
}
