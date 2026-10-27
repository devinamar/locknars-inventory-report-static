-- Each weapon d2-perk-popularity scores, one row per side, with what the
-- report shows about it there. pool is its trait pool's label when its family
-- splits (the name after the family's, like "(Pantheon)"), else ''. grid_id
-- names its perk grid (v_popularity_version). hard_copies and hard_votes,
-- normal_copies and normal_votes are its two content groups' voting copies
-- and effective votes; hard_share is the hard group's part of its copies, and
-- endgame is 1 when that clears popularity_rule's bar for the side's badge.
-- confidence, weakest (its label) and weakest_votes come from its weakest
-- column (v_popularity_column), with that column's top pick and its range,
-- and same, which says whether every column has the same votes; all are NULL
-- for a weapon with no scored columns (a fixed roll). margin is its shares'
-- margin of error: half the widest 95% range among its perks' shares
-- (v_popularity_perk), its origin traits' only when it has no other perks,
-- as its weakest column leaves the origin out; NULL for a fixed roll.
CREATE VIEW v_popularity_weapon AS
WITH weapon AS (
    SELECT w.*,
           COALESCE(w.groups ->> '$.hard.copies', 0) AS hard_copies,
           COALESCE(w.groups ->> '$.hard.n_eff', 0) AS hard_votes,
           COALESCE(w.groups ->> '$.normal.copies', 0) AS normal_copies,
           COALESCE(w.groups ->> '$.normal.n_eff', 0) AS normal_votes
    FROM perk_popularity_weapon w
)
SELECT w.side, w.name, w.family,
       CASE WHEN w.name = w.family THEN '' ELSE trim(substr(w.name, length(w.family) + 1)) END
           AS pool,
       w.type, w.item_hash, v.grid_id, w.rank, w.players, w.last_seen,
       w.hard_copies, w.hard_votes, w.normal_copies, w.normal_votes,
       1.0 * w.hard_copies / w.players AS hard_share,
       w.hard_copies >= r.endgame_copies AND 1.0 * w.hard_copies / w.players >= r.endgame_share
           AS endgame,
       c.confidence, c.label AS weakest, c.votes AS weakest_votes, c.same,
       c.top, c.top_share, c.top_low, c.top_high, m.margin
FROM weapon w
JOIN (SELECT DISTINCT name, grid_id FROM v_popularity_version) v ON v.name = w.name
CROSS JOIN popularity_rule r
LEFT JOIN v_popularity_column c ON c.side = w.side AND c.name = w.name AND c.weakest
LEFT JOIN (
    SELECT side, name,
           COALESCE(MAX(CASE WHEN col != 'origin' THEN (high - low) / 2 END),
                    MAX((high - low) / 2)) AS margin
    FROM v_popularity_perk
    GROUP BY side, name
) m ON m.side = w.side AND m.name = w.name;
