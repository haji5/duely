package com.bracketbattle.dto;

import com.bracketbattle.model.Bracket;

import java.util.ArrayList;
import java.util.List;

/** One page of a bracket list and how many match in all. Plain class so the Valkey cache can round-trip it. */
public class BracketPageDto {
    private List<Bracket> items = new ArrayList<>();
    private int page;
    private int size;
    private long total;

    public BracketPageDto() {}

    public BracketPageDto(List<Bracket> items, int page, int size, long total) {
        this.items = new ArrayList<>(items);
        this.page = page;
        this.size = size;
        this.total = total;
    }

    public List<Bracket> getItems() { return items; }
    public void setItems(List<Bracket> items) { this.items = items; }

    /** Zero-based. */
    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }

    /** The page size used, after capping. */
    public int getSize() { return size; }
    public void setSize(int size) { this.size = size; }

    /** Brackets matching the filters, on every page together. */
    public long getTotal() { return total; }
    public void setTotal(long total) { this.total = total; }
}
