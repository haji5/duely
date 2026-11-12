package com.bracketbattle.repository;

import com.bracketbattle.dto.BracketListQuery;
import com.bracketbattle.dto.BracketPageDto;
import com.bracketbattle.dto.HomeDto;
import com.bracketbattle.model.Bracket;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Bracket lists, paged and filtered in the database. Built as SQL rather than JPA queries so the
 * predicates reach Postgres as literals: the list indexes are partial on {@link #LISTED}, and the
 * planner only uses a partial index when it can see the query implies its predicate, which a
 * bound parameter ({@code item_count >= ?}) hides.
 */
@Repository
public class BracketListRepository {

    /** On the public lists: not hidden, and playable. Must match the partial indexes (changeset 15). */
    static final String LISTED = "b.hidden_at IS NULL AND b.item_count >= 2";

    private static final String COLUMNS =
            "b.id, b.name, b.description, b.type, b.category, b.created_at, b.hidden_at, b.item_count, b.run_count";

    private static final RowMapper<Bracket> BRACKET = (rs, rowNum) -> {
        Bracket b = new Bracket(rs.getString("name"), rs.getString("description"), rs.getString("type"),
                rs.getString("category"), null);
        b.setId(rs.getLong("id"));
        b.setCreatedAt(instant(rs, "created_at"));
        b.setHiddenAt(instant(rs, "hidden_at"));
        b.setItemCount(rs.getInt("item_count"));
        b.setRunCount(rs.getLong("run_count"));
        return b;
    };

    private final NamedParameterJdbcTemplate jdbc;

    public BracketListRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The public lists: playable, not hidden. */
    public BracketPageDto listPublic(BracketListQuery query) {
        return list(LISTED, new MapSqlParameterSource(), query);
    }

    /** One creator's brackets, hidden and unplayable ones included. */
    public BracketPageDto listByCreator(String uid, BracketListQuery query) {
        return list("b.created_by = :uid", new MapSqlParameterSource("uid", uid), query);
    }

    private BracketPageDto list(String scope, MapSqlParameterSource params, BracketListQuery query) {
        StringBuilder where = new StringBuilder(scope);
        if (query.type() != null) {
            where.append(" AND b.type = :type");
            params.addValue("type", query.type());
        }
        if (query.category() != null) {
            where.append(" AND b.category = :category");
            params.addValue("category", query.category());
        }
        if (query.q() != null) {
            where.append(" AND (b.name ILIKE :pattern ESCAPE '\\' OR b.description ILIKE :pattern ESCAPE '\\')");
            params.addValue("pattern", "%" + escapeLike(query.q()) + "%");
        }
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM brackets b WHERE " + where, params, Long.class);
        long count = total == null ? 0 : total;
        if (query.offset() >= count) {
            return new BracketPageDto(List.of(), query.page(), query.size(), count);
        }
        params.addValue("limit", query.size()).addValue("offset", query.offset());
        List<Bracket> items = jdbc.query("SELECT " + COLUMNS + " FROM brackets b WHERE " + where
                + " ORDER BY " + query.sort().orderBy + " LIMIT :limit OFFSET :offset", params, BRACKET);
        return new BracketPageDto(items, query.page(), query.size(), count);
    }

    /** The first {@code limit} public brackets in {@code sort} order; {@code playedOnly} skips unplayed ones. */
    public List<Bracket> top(BracketListQuery.Sort sort, int limit, boolean playedOnly) {
        return jdbc.query("SELECT " + COLUMNS + " FROM brackets b WHERE " + LISTED
                        + (playedOnly ? " AND b.run_count > 0" : "")
                        + " ORDER BY " + sort.orderBy + " LIMIT :limit",
                new MapSqlParameterSource("limit", limit), BRACKET);
    }

    /**
     * The {@code perCategory} most played public brackets of each category, for at most
     * {@code maxCategories} categories: those whose best bracket is most played first. One pass
     * over the public brackets; the home page caches the answer.
     */
    public List<HomeDto.CategorySection> topPerCategory(int perCategory, int maxCategories) {
        List<Bracket> rows = jdbc.query("""
                SELECT %s FROM (
                    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b.category ORDER BY %s) AS place
                    FROM brackets b WHERE %s
                ) b
                WHERE b.place <= :perCategory
                ORDER BY %s
                """.formatted(COLUMNS, BracketListQuery.Sort.POPULAR.orderBy, LISTED, BracketListQuery.Sort.POPULAR.orderBy),
                new MapSqlParameterSource("perCategory", perCategory), BRACKET);
        // Rows arrive most played first, so a category's first row is its best bracket and
        // categories come out in the order of their best brackets.
        Map<String, List<Bracket>> byCategory = new LinkedHashMap<>();
        for (Bracket b : rows) {
            if (byCategory.size() >= maxCategories && !byCategory.containsKey(b.getCategory())) continue;
            byCategory.computeIfAbsent(b.getCategory(), c -> new ArrayList<>()).add(b);
        }
        List<HomeDto.CategorySection> sections = new ArrayList<>();
        byCategory.forEach((category, brackets) -> sections.add(new HomeDto.CategorySection(category, brackets)));
        return sections;
    }

    // ---- sitemap -----------------------------------------------------------------------------

    /** A public bracket as the sitemap needs it; {@code lastRunAt} is null until a run counts. */
    public record SitemapEntry(long id, Instant createdAt, Instant lastRunAt) {}

    public long countListed() {
        Long count = jdbc.getJdbcTemplate().queryForObject("SELECT COUNT(*) FROM brackets b WHERE " + LISTED, Long.class);
        return count == null ? 0 : count;
    }

    /** When the newest public bracket was made, or null if there is none. */
    public Instant newestListed() {
        List<Instant> newest = jdbc.query("SELECT b.created_at FROM brackets b WHERE " + LISTED
                + " ORDER BY " + BracketListQuery.Sort.NEWEST.orderBy + " LIMIT 1", Map.of(), (rs, n) -> instant(rs, "created_at"));
        return newest.isEmpty() ? null : newest.get(0);
    }

    /** Public brackets in id order, so each sitemap file keeps its brackets as new ones are added. */
    public List<SitemapEntry> sitemapEntries(long offset, int limit) {
        return jdbc.query("SELECT b.id, b.created_at, b.last_run_at FROM brackets b WHERE " + LISTED
                        + " ORDER BY b.id LIMIT :limit OFFSET :offset",
                new MapSqlParameterSource("limit", limit).addValue("offset", offset),
                (rs, n) -> new SitemapEntry(rs.getLong("id"), instant(rs, "created_at"), instant(rs, "last_run_at")));
    }

    static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
