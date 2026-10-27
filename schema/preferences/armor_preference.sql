-- Per armor set and per exotic: up to three priority stats. A set also has a
-- grade (S to F) and its rank within the grade (1 comes first); exotics have
-- neither.
CREATE TABLE armor_preference (
    name       TEXT PRIMARY KEY,
    is_exotic  INTEGER NOT NULL DEFAULT 0,
    stat_1     TEXT,
    stat_2     TEXT,
    stat_3     TEXT,
    grade      TEXT NOT NULL DEFAULT '',     -- 'S'..'F'; '' for exotics and unclassified sets
    rank       INTEGER NOT NULL DEFAULT 0    -- 1 = first within the grade
);
