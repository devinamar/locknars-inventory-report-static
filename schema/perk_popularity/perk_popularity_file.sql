-- The published perk_scores.json's own fields, one row: when it was made, and
-- the settings and activity categories its scores were made under.
CREATE TABLE perk_popularity_file (
    generated_at  TEXT NOT NULL,   -- ISO 8601, UTC
    -- {key: value} as JSON, such as window_days (a copy votes while used in
    -- this many days) and hard_weight (hard content's part of a side's scores
    -- when both groups are well measured).
    settings      TEXT NOT NULL,
    -- The activity categories votes come from, as a JSON array: key (like
    -- 'raid_master'), label, side, weight (what a vote from it carries;
    -- doubling with each step in difficulty) and hard.
    categories    TEXT NOT NULL
);
