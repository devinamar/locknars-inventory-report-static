-- Every trait pair d2-perk-popularity scores (its traits column: "A + B", A
-- from the first trait socket), one row per side, weapon and pair: its share
-- of the weapon's pairs with its 95% range, its rank (1 for the most picked
-- pair) and rel, its share against the top pair's (0 when the published file
-- rounds every pair's share to 0). A weapon with one trait socket scores
-- single traits in that column, not pairs; they aren't listed.
CREATE VIEW v_popularity_pair AS
WITH pair AS (
    SELECT w.side, w.name, p.key + 1 AS rank, p.value ->> 'share' AS share,
           p.value ->> 'low' AS low, p.value ->> 'high' AS high,
           substr(p.value ->> 'perk', 1, instr(p.value ->> 'perk', ' + ') - 1) AS trait1,
           substr(p.value ->> 'perk', instr(p.value ->> 'perk', ' + ') + 3) AS trait2
    FROM perk_popularity_weapon w
    CROSS JOIN json_each(w.columns) c
    CROSS JOIN json_each(c.value, '$.perks') p
    WHERE c.value ->> 'kind' = 'traits' AND instr(p.value ->> 'perk', ' + ') > 0
)
SELECT side, name, trait1, trait2, share, low, high, rank,
       COALESCE(share / MAX(share) OVER (PARTITION BY side, name), 0) AS rel
FROM pair;
