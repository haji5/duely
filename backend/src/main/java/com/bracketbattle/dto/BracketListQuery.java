package com.bracketbattle.dto;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.model.Categories;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * One page of a bracket list: {@code ?sort=&type=&category=&q=&page=&size=}, checked. Null
 * filters mean "any". {@code size} above {@link #MAX_SIZE} is capped rather than refused, so a
 * client asking for more simply gets the most there is.
 */
public record BracketListQuery(Sort sort, String type, String category, String q, int page, int size) {

    public static final int DEFAULT_SIZE = 24;
    public static final int MAX_SIZE = 50;
    /**
     * How deep a page may start. OFFSET walks every row before it, so without a bound one request
     * could make the database step through the whole table; past this, searching beats paging.
     */
    public static final int MAX_OFFSET = 10_000;
    public static final int MAX_QUERY_LENGTH = 100;

    private static final Set<String> TYPES = Set.of("song", "video", "image");

    /** List orders. Every one ends on the id, so pages never overlap or skip a row. */
    public enum Sort {
        NEWEST("b.created_at DESC, b.id DESC"),
        OLDEST("b.created_at ASC, b.id ASC"),
        POPULAR("b.run_count DESC, b.created_at DESC, b.id DESC"),
        // LOWER: the database collation may compare bytes, which puts every capital before "a".
        NAME("LOWER(b.name) ASC, b.id ASC");

        public final String orderBy;

        Sort(String orderBy) {
            this.orderBy = orderBy;
        }
    }

    public static BracketListQuery parse(String sort, String type, String category, String q, Integer page, Integer size) {
        Sort parsedSort = Sort.NEWEST;
        if (!isBlank(sort)) {
            try {
                parsedSort = Sort.valueOf(sort.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw invalid("sort", "Sort must be newest, oldest, popular or name");
            }
        }
        String parsedType = isBlank(type) ? null : type.trim().toLowerCase(Locale.ROOT);
        if (parsedType != null && !TYPES.contains(parsedType)) {
            throw invalid("type", "Type must be song, video or image");
        }
        // Not limited to Categories.ALL: brackets from before the fixed list keep their own
        // category, and they can still be filtered on.
        String parsedCategory = isBlank(category) ? null : category.trim();
        if (parsedCategory != null && parsedCategory.length() > 100) {
            throw invalid("category", "Category is too long");
        }
        if (parsedCategory != null) {
            parsedCategory = Categories.canonical(parsedCategory).orElse(parsedCategory);
        }
        String parsedQ = isBlank(q) ? null : q.trim();
        if (parsedQ != null && parsedQ.length() > MAX_QUERY_LENGTH) {
            throw invalid("q", "Search for at most " + MAX_QUERY_LENGTH + " characters");
        }
        int parsedPage = page == null ? 0 : page;
        if (parsedPage < 0) {
            throw invalid("page", "Page must be 0 or more");
        }
        int parsedSize = size == null ? DEFAULT_SIZE : Math.min(size, MAX_SIZE);
        if (parsedSize < 1) {
            throw invalid("size", "Size must be at least 1");
        }
        if ((long) parsedPage * parsedSize > MAX_OFFSET) {
            throw invalid("page", "That page is too far in; narrow the list with a search or a filter");
        }
        return new BracketListQuery(parsedSort, parsedType, parsedCategory, parsedQ, parsedPage, parsedSize);
    }

    public int offset() {
        return page * size;
    }

    /**
     * Only first pages of unfiltered lists are cached: they are what most visitors load, and
     * their keys are few (four sorts by at most {@link #MAX_SIZE} sizes). Searches and deep
     * pages would fill the cache with entries nobody asks for twice.
     */
    public boolean cacheable() {
        return page == 0 && type == null && category == null && q == null;
    }

    public String cacheKey() {
        return sort.name().toLowerCase(Locale.ROOT) + ":" + size;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static InvalidRequestException invalid(String field, String message) {
        return new InvalidRequestException(message, Map.of(field, message));
    }
}
