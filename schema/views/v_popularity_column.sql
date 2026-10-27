-- Each column d2-perk-popularity scores, the trait pairs (col traits)
-- included, one row per side, weapon and column: its label (what the weapon
-- calls the socket, from its top perk's plug; Trait 1, Trait 2, and Trait
-- pairs, or Traits where a single trait socket scores single traits), its
-- confidence, its effective votes (votes: n_eff rounded), and its top pick,
-- the most picked perk or pair, with its share and 95% range. weakest is 1 for
-- the weapon's column with the fewest votes (ties go to trait1, trait2, then
-- the pairs, then socket order): its confidence is the weapon's. The origin
-- column is weakest only for a weapon with no other: only some copies may
-- have an origin trait, which shouldn't sink the rest. same is 1 when every
-- other column of the weapon has the same votes.
CREATE VIEW v_popularity_column AS
WITH col AS (
    SELECT w.side, w.name, c.key AS col_n, c.value ->> 'kind' AS col,
           c.value ->> 'confidence' AS confidence,
           CAST(round(c.value ->> 'n_eff') AS INTEGER) AS votes,
           c.value ->> '$.perks[0].perk' AS top, c.value ->> '$.perks[0].share' AS top_share,
           c.value ->> '$.perks[0].low' AS top_low, c.value ->> '$.perks[0].high' AS top_high
    FROM perk_popularity_weapon w
    CROSS JOIN json_each(w.columns) c
),
label AS (
    SELECT name, kind, MIN(label) AS label
    FROM v_plug
    WHERE kind IS NOT NULL AND name != ''
    GROUP BY name, kind
)
SELECT c.side, c.name, c.col_n, c.col,
       CASE WHEN c.col = 'traits' AND instr(c.top, ' + ') > 0 THEN 'Trait pairs'
            WHEN c.col = 'traits' THEN 'Traits'
            WHEN c.col = 'trait1' THEN 'Trait 1'
            WHEN c.col = 'trait2' THEN 'Trait 2'
            ELSE COALESCE(l.label, upper(substr(c.col, 1, 1)) || substr(c.col, 2)) END AS label,
       c.confidence, c.votes, c.top, c.top_share, c.top_low, c.top_high,
       ROW_NUMBER() OVER (
           PARTITION BY c.side, c.name
           ORDER BY c.col = 'origin', c.votes,
                    CASE c.col WHEN 'trait1' THEN 0 WHEN 'trait2' THEN 1 WHEN 'traits' THEN 2
                               ELSE 3 END,
                    c.col_n
       ) = 1 AS weakest,
       MIN(CASE WHEN c.col != 'origin' THEN c.votes END) OVER (PARTITION BY c.side, c.name)
           = MAX(CASE WHEN c.col != 'origin' THEN c.votes END) OVER (PARTITION BY c.side, c.name)
           AS same
FROM col c
LEFT JOIN label l ON l.name = c.top AND l.kind = c.col;
