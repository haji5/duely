package com.bracketbattle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;

/**
 * Request DTO for creating a new bracket.
 * Size constraints are enforced to prevent excessive memory usage and ensure
 * reasonable display in the UI.
 */
public class CreateBracketRequest {

    @NotBlank(message = "Bracket name is required")
    @Size(min = 1, max = 100, message = "Bracket name must be between 1 and 100 characters")
    private String name;

    @Size(max = 2000, message = "Description cannot exceed 2000 characters")
    private String description;

    @NotBlank(message = "Bracket type is required")
    @Pattern(regexp = "^(song|video|image)$", message = "Invalid type. Must be: song, video, or image")
    private String type;

    @NotBlank(message = "Category is required")
    @Size(min = 1, max = 100, message = "Category must be between 1 and 100 characters")
    private String category = "General";

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
}
