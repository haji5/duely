package com.bracketbattle.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "brackets")
public class Bracket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private String type;

    @Column(name = "category", nullable = false)
    private String category = "General";

    @Column(name = "created_at")
    private Instant createdAt;

    // Hidden from JSON so public lists don't leak Firebase UIDs. The Valkey cache uses the same
    // annotations, so cached copies have no owner either: ownership checks must always read the
    // repository, never the cache.
    @JsonIgnore
    @Column(name = "created_by")
    private String createdBy;

    // Set by a moderator. Hidden brackets are only ever served to their owner and admins, so the
    // public never sees this field set; for those two it is the badge's source.
    @Column(name = "hidden_at")
    private Instant hiddenAt;

    // Counters for lists and sorting. Set at creation, then changed only by SQL in the
    // transactions that change what they count (a counted run, a rebuild), never by saving the
    // entity, so a stale copy can't write an old count back.
    @Column(name = "item_count", nullable = false, updatable = false)
    private int itemCount;

    @Column(name = "run_count", nullable = false, updatable = false)
    private long runCount;

    // Only the sitemap needs it, and it reads the table.
    @JsonIgnore
    @Column(name = "last_run_at", insertable = false, updatable = false)
    private Instant lastRunAt;

    public Bracket() {}

    public Bracket(String name, String description, String type, String category, String createdBy) {
        this.name = name;
        this.description = description;
        this.type = type;
        this.category = category;
        this.createdBy = createdBy;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
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

    @JsonIgnore
    public String getCreatedBy() { return createdBy; }
    @JsonIgnore
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Instant getHiddenAt() { return hiddenAt; }
    public void setHiddenAt(Instant hiddenAt) { this.hiddenAt = hiddenAt; }

    /** Entries in the bracket; it is playable from two. */
    public int getItemCount() { return itemCount; }
    public void setItemCount(int itemCount) { this.itemCount = itemCount; }

    /** Runs that count toward the leaderboard, guests' included. */
    public long getRunCount() { return runCount; }
    public void setRunCount(long runCount) { this.runCount = runCount; }

    @JsonIgnore
    public Instant getLastRunAt() { return lastRunAt; }
    @JsonIgnore
    public void setLastRunAt(Instant lastRunAt) { this.lastRunAt = lastRunAt; }
}
