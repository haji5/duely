package com.bracketbattle.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public class BulkAddItemsRequest {

    @NotNull
    @NotEmpty(message = "Items list cannot be empty")
    @Size(max = 500, message = "Cannot add more than 500 items at once")
    private List<@Valid AddItemRequest> items;

    public List<AddItemRequest> getItems() {
        return items;
    }

    public void setItems(List<AddItemRequest> items) {
        this.items = items;
    }
}

