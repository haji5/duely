-- Rebuilds item_stats from the results table. Legacy runs have no recorded matches, so wins and
-- matches use the position-based approximation: the item at 1-based position pos of an n-item
-- ranking "beat" the n - pos items below it out of n - 1. Runs saved with matches are added
-- incrementally by the application, never by this script.
INSERT INTO item_stats (item_id, bracket_id, times_ranked, score_sum, wins, matches)
SELECT e.item_id, r.bracket_id, COUNT(*),
       SUM(CASE WHEN r.n > 1 THEN (r.n - e.pos)::float8 / (r.n - 1) ELSE 1 END),
       SUM(r.n - e.pos), SUM(r.n - 1)
FROM (SELECT bracket_id, ranking::jsonb AS rk, jsonb_array_length(ranking::jsonb) AS n FROM results) r
CROSS JOIN LATERAL (SELECT value::bigint AS item_id, ordinality AS pos
                    FROM jsonb_array_elements_text(r.rk) WITH ORDINALITY) e
JOIN items i ON i.id = e.item_id AND i.bracket_id = r.bracket_id
GROUP BY e.item_id, r.bracket_id;
