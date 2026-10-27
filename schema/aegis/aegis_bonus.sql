-- The Aegis's set-bonus rankings, one row per bonus (a set's 2pc and 4pc
-- are ranked independently), kept for reference beside the armor
-- preferences. Replaced wholesale by extract/aegis.py.
CREATE TABLE aegis_bonus (
    set_name      TEXT NOT NULL,              -- sheet spelling
    pieces        INTEGER NOT NULL,           -- 2 or 4
    bonus_name    TEXT NOT NULL,
    source        TEXT NOT NULL DEFAULT '',   -- activity / location the set drops from
    season        TEXT NOT NULL DEFAULT '',
    tags          TEXT NOT NULL DEFAULT '',   -- newline-separated
    trigger_text  TEXT NOT NULL DEFAULT '',
    effect        TEXT NOT NULL DEFAULT '',
    analysis      TEXT NOT NULL DEFAULT '',
    rank          INTEGER NOT NULL,           -- 1 = best bonus overall
    grade         TEXT NOT NULL,              -- 'S'..'F', the sheet's Tier column
    PRIMARY KEY (set_name, pieces)
);
