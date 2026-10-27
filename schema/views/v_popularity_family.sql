-- Each family's pooled effective votes per column: n_eff summed over both
-- sides and every scored weapon of the family, the evidence the report's perk
-- grids weigh before hiding a perk no copy of the family was seen with
-- (popularity_rule's seen_votes).
CREATE VIEW v_popularity_family AS
SELECT w.family, c.value ->> 'kind' AS col, SUM(c.value ->> 'n_eff') AS votes
FROM perk_popularity_weapon w
CROSS JOIN json_each(w.columns) c
GROUP BY w.family, col;
