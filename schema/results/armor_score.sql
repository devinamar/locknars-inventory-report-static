-- Armor score for every exotic and every Armor 3.0 piece, the ranking key
-- when pruning. Legacy Legendary pieces aren't scored; they're always flagged.
--   preferred_score = 3*stat[pref1] + 2*stat[pref2] + 1*stat[pref3] of the
--                     variant (a tuning swap the piece's socket offers, or
--                     none, plus masterwork) that maximises it
-- Pieces without stat picks score their best variant's stat total.
CREATE TABLE armor_score (
    instance_id      TEXT PRIMARY KEY
        REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    preferred_score  REAL NOT NULL DEFAULT 0,
    best_tuning      TEXT NOT NULL DEFAULT '',   -- variant label maximising preferred_score
    tuning_gain      REAL NOT NULL DEFAULT 0,    -- what that swap adds to the untuned score
    best_health      INTEGER NOT NULL DEFAULT 0, -- that variant's stats, masterwork included
    best_melee       INTEGER NOT NULL DEFAULT 0,
    best_grenade     INTEGER NOT NULL DEFAULT 0,
    best_super_stat  INTEGER NOT NULL DEFAULT 0,
    best_class_stat  INTEGER NOT NULL DEFAULT 0,
    best_weapons     INTEGER NOT NULL DEFAULT 0
);
