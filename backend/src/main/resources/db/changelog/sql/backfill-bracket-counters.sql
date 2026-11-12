-- Bracket counters from the rows they count. Re-runnable: BackfillMigrationIT replays it and
-- compares the result with the counters the application maintains.
UPDATE brackets b SET
    item_count = (SELECT COUNT(*) FROM items i WHERE i.bracket_id = b.id),
    run_count = (SELECT COUNT(*) FROM results r WHERE r.bracket_id = b.id AND r.counted),
    last_run_at = (SELECT MAX(r.created_at) FROM results r WHERE r.bracket_id = b.id AND r.counted);
