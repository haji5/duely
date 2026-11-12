package com.bracketbattle.dto;

import com.bracketbattle.model.Bracket;

import java.time.Instant;

/**
 * A bracket as the API returns it and the cache keeps it. Only the fields listed here leave the
 * server, so a field added to the entity stays private until it is added here too; in particular
 * the owner is never in it, and ownership checks read the table (see BracketAccess). A plain
 * class rather than a record: the Valkey cache serialiser only writes type information for
 * non-final classes.
 */
public class BracketDto {
    private Long id;
    private String name;
    private String description;
    private String type;
    private String category;
    private Instant createdAt;
    private Instant hiddenAt;
    private int itemCount;
    private long runCount;

    public BracketDto() {}

    public BracketDto(Long id, String name, String description, String type, String category, Instant createdAt,
                      Instant hiddenAt, int itemCount, long runCount) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.type = type;
        this.category = category;
        this.createdAt = createdAt;
        this.hiddenAt = hiddenAt;
        this.itemCount = itemCount;
        this.runCount = runCount;
    }

    public static BracketDto from(Bracket b) {
        return new BracketDto(b.getId(), b.getName(), b.getDescription(), b.getType(), b.getCategory(),
                b.getCreatedAt(), b.getHiddenAt(), b.getItemCount(), b.getRunCount());
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    /** Set when a moderator hid it. Only its owner and admins are ever sent a hidden bracket. */
    public Instant getHiddenAt() { return hiddenAt; }
    public void setHiddenAt(Instant hiddenAt) { this.hiddenAt = hiddenAt; }

    /** Entries in the bracket; it is playable from two. */
    public int getItemCount() { return itemCount; }
    public void setItemCount(int itemCount) { this.itemCount = itemCount; }

    /** Runs that count toward the leaderboard, guests' included. */
    public long getRunCount() { return runCount; }
    public void setRunCount(long runCount) { this.runCount = runCount; }
}
