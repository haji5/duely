package com.bracketbattle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class AddItemRequest {

    @NotBlank
    @Size(max = 150)
    private String title;

    @NotBlank
    @Size(min = 10, max = 2000, message = "Media URL must be between 10 and 2000 characters")
    private String mediaUrl;

    @NotBlank
    @Pattern(regexp = "^(song|video|image)$", message = "Invalid mediaType. Must be: song, video, or image")
    private String mediaType;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }

    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
}
