package com.bracketbattle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request DTO for adding an item to a bracket.
 * Size constraints prevent excessive memory usage and ensure compatibility
 * with database columns. Media URLs are validated for SSRF protection in the service layer.
 */
public class AddItemRequest {

    @NotBlank(message = "Title is required")
    @Size(min = 1, max = 150, message = "Title must be between 1 and 150 characters")
    private String title;

    @NotBlank(message = "Media URL is required")
    @Size(min = 10, max = 2000, message = "Media URL must be between 10 and 2000 characters")
    private String mediaUrl;

    @NotBlank(message = "Media type is required")
    @Pattern(regexp = "^(song|video|image)$", message = "Invalid mediaType. Must be: song, video, or image")
    private String mediaType;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }

    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
}
