-- Every perk d2-perk-popularity scores outside its trait pairs, one row per
-- side, weapon, column and perk: its share of the column's votes with its 95%
-- range, its rank (its place in the column, 1 for the most picked), and rel,
-- its share against the column's top share (1 for the most picked perk, 0
-- where the published shares round to 0), which the report's heat colours
-- show. col is the column's kind (barrel, magazine, stock, grip, origin,
-- trait1, trait2), v_weapon_pool's col; col_n is its place in the published
-- columns, which are in socket order.
CREATE VIEW v_popularity_perk AS
SELECT w.side, w.name, c.value ->> 'kind' AS col, c.key AS col_n,
       p.value ->> 'perk' AS perk, p.value ->> 'share' AS share,
       p.value ->> 'low' AS low, p.value ->> 'high' AS high, p.key + 1 AS rank,
       COALESCE((p.value ->> 'share')
                / MAX(p.value ->> 'share') OVER (PARTITION BY w.side, w.name, c.key), 0) AS rel
FROM perk_popularity_weapon w
CROSS JOIN json_each(w.columns) c
CROSS JOIN json_each(c.value, '$.perks') p
WHERE c.value ->> 'kind' != 'traits';
