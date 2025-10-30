package com.bracketbattle.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Request DTO for bulk adding items to a bracket.
 * Maximum of 500 items can be added in a single request to prevent
 * memory exhaustion and ensure reasonable processing time.
 */
public class BulkAddItemsRequest {

    @NotNull(message = "Items list must not be null")
    @NotEmpty(message = "Items list cannot be empty")
    @Size(min = 1, max = 500, message = "Items list must contain between 1 and 500 items")
    private List<@Valid AddItemRequest> items;

    public List<AddItemRequest> getItems() {
        return items;
    }

    public void setItems(List<AddItemRequest> items) {
        this.items = items;
    }
}

