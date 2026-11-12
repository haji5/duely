package com.bracketbattle.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * What the home page shows, in one cached response: the most played brackets, the newest, and
 * the top few of each category. Plain classes so the Valkey cache can round-trip them.
 */
public class HomeDto {
    private List<BracketDto> popular = new ArrayList<>();
    private List<BracketDto> recent = new ArrayList<>();
    private List<CategorySection> categories = new ArrayList<>();

    public HomeDto() {}

    public HomeDto(List<BracketDto> popular, List<BracketDto> recent, List<CategorySection> categories) {
        this.popular = new ArrayList<>(popular);
        this.recent = new ArrayList<>(recent);
        this.categories = new ArrayList<>(categories);
    }

    /** Played brackets, most counted runs first. Empty until something has been played. */
    public List<BracketDto> getPopular() { return popular; }
    public void setPopular(List<BracketDto> popular) { this.popular = popular; }

    /** Newest first. Empty only when there is no playable bracket at all. */
    public List<BracketDto> getRecent() { return recent; }
    public void setRecent(List<BracketDto> recent) { this.recent = recent; }

    /** Categories whose best bracket is most played first; within one, most played first. */
    public List<CategorySection> getCategories() { return categories; }
    public void setCategories(List<CategorySection> categories) { this.categories = categories; }

    public static class CategorySection {
        private String category;
        private List<BracketDto> brackets = new ArrayList<>();

        public CategorySection() {}

        public CategorySection(String category, List<BracketDto> brackets) {
            this.category = category;
            this.brackets = new ArrayList<>(brackets);
        }

        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }

        public List<BracketDto> getBrackets() { return brackets; }
        public void setBrackets(List<BracketDto> brackets) { this.brackets = brackets; }
    }
}
