package com.bracketbattle.model;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The fixed set of bracket categories. Free text let anyone add filter chips to Browse; the
 * create form only ever offered these. Mirrored by CATEGORIES in
 * frontend/src/pages/CustomBracketPage.tsx; both test suites check against
 * shared/categories.json. Existing rows with other values are left as they are.
 */
public final class Categories {

    public static final String DEFAULT = "General";

    public static final List<String> ALL = List.of(
            "General", "Music", "TV", "Movies", "Sports", "Gaming", "Food", "Travel", "Art", "Technology",
            "Entertainment");

    private Categories() {}

    /** The canonical spelling of {@code value} (case-insensitive), or empty if it isn't a category. */
    public static Optional<String> canonical(String value) {
        String wanted = value.toLowerCase(Locale.ROOT);
        return ALL.stream().filter(c -> c.toLowerCase(Locale.ROOT).equals(wanted)).findFirst();
    }
}
