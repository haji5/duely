package com.bracketbattle.dto;

import com.bracketbattle.model.Item;

/**
 * An entry as the API returns it and the cache keeps it (see BracketDto for why it is not the
 * entity, and not a record).
 */
public class ItemDto {
    private Long id;
    private Long bracketId;
    private String title;
    private String mediaUrl;
    private String mediaType;

    public ItemDto() {}

    public ItemDto(Long id, Long bracketId, String title, String mediaUrl, String mediaType) {
        this.id = id;
        this.bracketId = bracketId;
        this.title = title;
        this.mediaUrl = mediaUrl;
        this.mediaType = mediaType;
    }

    public static ItemDto from(Item item) {
        return new ItemDto(item.getId(), item.getBracketId(), item.getTitle(), item.getMediaUrl(), item.getMediaType());
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getBracketId() { return bracketId; }
    public void setBracketId(Long bracketId) { this.bracketId = bracketId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }

    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
}
