package com.bracketbattle.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/** A new bracket and all of its entries, created in one transaction. */
public record CreateBracketRequest(
        @NotBlank(message = "Bracket name is required")
        @Size(max = 100, message = "Bracket name must be at most 100 characters")
        String name,

        @Size(max = 2000, message = "Description must be at most 2000 characters")
        String description,

        @NotBlank(message = "Bracket type is required")
        @Pattern(regexp = "^(song|video|image)$", message = "Type must be song, video or image")
        String type,

        @Size(max = 50, message = "Category must be at most 50 characters")
        String category,

        @NotNull(message = "Entries are required")
        @Size(min = 2, max = 500, message = "A bracket needs between 2 and 500 entries")
        List<@NotNull(message = "Entry must not be null") @Valid NewItemRequest> items
) {
    public record NewItemRequest(
            @NotBlank(message = "Title is required")
            @Size(max = 150, message = "Title must be at most 150 characters")
            String title,

            @NotBlank(message = "Media URL is required")
            @Size(min = 10, max = 2000, message = "Media URL must be between 10 and 2000 characters")
            String mediaUrl
    ) {}
}
