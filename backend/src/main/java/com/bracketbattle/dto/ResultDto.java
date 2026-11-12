package com.bracketbattle.dto;

import com.bracketbattle.model.MatchOutcome;
import com.bracketbattle.model.Result;
import com.bracketbattle.scoring.RunScoring;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * A run as its submitter sees it: the save response and their history. Who submitted it, its
 * ticket nonce and whether it counted are not in it (the last deliberately not told to the
 * client). Public views of runs use CommentDto. A plain class for the cache, as BracketDto.
 */
public class ResultDto {
    private Long id;
    private Long bracketId;
    private List<Long> ranking = new ArrayList<>();
    private List<Place> places = new ArrayList<>();
    private List<MatchOutcome> matches;
    private Instant createdAt;
    private String displayName;
    private String comment;

    public ResultDto() {}

    public static ResultDto from(Result result) {
        ResultDto dto = new ResultDto();
        dto.id = result.getId();
        dto.bracketId = result.getBracketId();
        dto.ranking = new ArrayList<>(result.getRanking());
        dto.places = places(result);
        List<MatchOutcome> matches = result.getMatches();
        dto.matches = matches == null ? null : new ArrayList<>(matches);
        dto.createdAt = result.getCreatedAt();
        dto.displayName = result.getDisplayName();
        dto.comment = result.getComment();
        return dto;
    }

    /** Each entry's place in the run, in ranking order. Tied entries share a range ("5th to 8th"). */
    private static List<Place> places(Result result) {
        RunScoring.Scored scored = result.scored();
        List<Place> places = new ArrayList<>();
        for (Long itemId : result.getRanking()) {
            RunScoring.Standing s = scored.standings().get(itemId);
            places.add(s == null ? new Place(itemId, 0, 0) : new Place(itemId, s.placeFrom(), s.placeTo()));
        }
        return places;
    }

    public record Place(long itemId, int from, int to) {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getBracketId() { return bracketId; }
    public void setBracketId(Long bracketId) { this.bracketId = bracketId; }

    /** Derived by the server from the matches: champion first. */
    public List<Long> getRanking() { return ranking; }
    public void setRanking(List<Long> ranking) { this.ranking = ranking; }

    /** Parallel to the ranking. */
    public List<Place> getPlaces() { return places; }
    public void setPlaces(List<Place> places) { this.places = places; }

    /** The run's real matches; null for runs saved before matches were recorded. */
    public List<MatchOutcome> getMatches() { return matches; }
    public void setMatches(List<MatchOutcome> matches) { this.matches = matches; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
