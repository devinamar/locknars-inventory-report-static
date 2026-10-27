-- Each weapon copy's popularity on each side: how close its roll is to what
-- players run, score (0 to 1), the mean over its slots of its best perk's
-- share against the slot's top (v_popularity_perk's rel; an unvoted perk
-- counts 0). The two trait columns are one slot, scored by the copy's best
-- trait pair against the top pair (v_popularity_pair), when its weapon has
-- pair scores on the side and the copy has both trait columns; otherwise each
-- trait column is a slot. A column its weapon has no scores for on the side
-- doesn't count; with no slots (slots 0) score is NULL. pair is the copy's
-- best trait pair there ("A + B", NULL without pair scores) with its share
-- and rank (NULL when players weren't seen with it). rank is the copy's place
-- on its card (v_weapon_card) for the side: by score, then wishlist matches,
-- gear tier and instance id.
CREATE VIEW v_copy_popularity AS
WITH side (side) AS (
    VALUES ('pve'), ('pvp')
),
copy AS MATERIALIZED (
    SELECT c.instance_id, c.card, c.entry, s.side
    FROM v_weapon_card c
    CROSS JOIN side s
),
perk AS MATERIALIZED (
    SELECT instance_id, col, perk FROM v_copy_perk
),
pair AS MATERIALIZED (
    SELECT side, name, trait1, trait2, rel, share, rank FROM v_popularity_pair
),
pair_option AS (
    SELECT cp.instance_id, cp.side, a.perk AS trait1, b.perk AS trait2,
           COALESCE(pp.rel, 0) AS rel, pp.share, pp.rank,
           ROW_NUMBER() OVER (
               PARTITION BY cp.instance_id, cp.side
               ORDER BY COALESCE(pp.rel, 0) DESC, pp.rank IS NULL, pp.rank, a.perk, b.perk
           ) AS n
    FROM copy cp
    JOIN (SELECT DISTINCT side, name FROM pair) scored
        ON scored.side = cp.side AND scored.name = cp.entry
    JOIN perk a ON a.instance_id = cp.instance_id AND a.col = 'trait1'
    JOIN perk b ON b.instance_id = cp.instance_id AND b.col = 'trait2'
    LEFT JOIN pair pp
        ON pp.side = cp.side AND pp.name = cp.entry AND pp.trait1 = a.perk AND pp.trait2 = b.perk
),
pair_slot AS MATERIALIZED (
    SELECT instance_id, side, rel AS value, trait1 || ' + ' || trait2 AS pair, share, rank
    FROM pair_option
    WHERE n = 1
),
column_slot AS (
    SELECT cp.instance_id, cp.side, k.col, MAX(COALESCE(pp.rel, 0)) AS value
    FROM copy cp
    JOIN perk k ON k.instance_id = cp.instance_id
    JOIN v_popularity_column pc ON pc.side = cp.side AND pc.name = cp.entry AND pc.col = k.col
    LEFT JOIN v_popularity_perk pp
        ON pp.side = cp.side AND pp.name = cp.entry AND pp.col = k.col AND pp.perk = k.perk
    LEFT JOIN pair_slot ps ON ps.instance_id = cp.instance_id AND ps.side = cp.side
    WHERE ps.instance_id IS NULL OR k.col NOT IN ('trait1', 'trait2')
    GROUP BY cp.instance_id, cp.side, k.col
),
score AS (
    SELECT instance_id, side, AVG(value) AS score, COUNT(*) AS slots
    FROM (
        SELECT instance_id, side, value FROM pair_slot
        UNION ALL
        SELECT instance_id, side, value FROM column_slot
    )
    GROUP BY instance_id, side
)
SELECT cp.instance_id, cp.side, s.score, COALESCE(s.slots, 0) AS slots, ps.pair,
       ps.share AS pair_share, ps.rank AS pair_rank,
       ROW_NUMBER() OVER (
           PARTITION BY cp.card, cp.side
           ORDER BY s.score IS NULL, s.score DESC, COALESCE(r.match_count, 0) DESC,
                    COALESCE(w.gear_tier, 0) DESC, cp.instance_id
       ) AS rank
FROM copy cp
LEFT JOIN score s ON s.instance_id = cp.instance_id AND s.side = cp.side
LEFT JOIN pair_slot ps ON ps.instance_id = cp.instance_id AND ps.side = cp.side
LEFT JOIN weapon_result r ON r.instance_id = cp.instance_id
LEFT JOIN v_weapon w ON w.instance_id = cp.instance_id;
