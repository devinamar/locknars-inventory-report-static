-- The three-stat builds each rescued piece takes to 100 (its stats in stat
-- order), with the lowest of the three totals it reaches. A rescue belongs to
-- the scores it was found with: replacing armor_score clears it.
CREATE TABLE armor_rescue (
    instance_id  TEXT NOT NULL REFERENCES armor_score(instance_id) ON DELETE CASCADE,
    stat_1       TEXT NOT NULL,
    stat_2       TEXT NOT NULL,
    stat_3       TEXT NOT NULL,
    new_min      INTEGER NOT NULL,
    PRIMARY KEY (instance_id, stat_1, stat_2, stat_3)
);
