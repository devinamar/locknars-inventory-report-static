-- The armor pieces to dismantle, one row each: why (reason) and the copy kept
-- in its place (keeper_id; NULL for a piece flagged on its own), worked out
-- from the saved scores (armor_score) and each set's grade (armor_preference,
-- armor_grade). Ties go to the lower itemInstanceId.
--   legacy: a non-exotic piece from before Armor 3.0 (no gear tier)
--   equal_same_set: the same class, slot, set, stats and tuning stats as an
--     older copy
--   cap_tier: past its set grade's slot_cap in its class and slot, best score
--     first, whatever its gear tier
--   exotic_dupe: past the best copy of its exotic, by class and name ignoring
--     case (a reissue competes with the old version), and for a class item its
--     perks
-- rescued is 1 for a cap_tier piece a three-stat build needs (armor_rescue);
-- it stays.
CREATE VIEW v_armor_pruning AS
WITH tuning AS (
    SELECT instance_id, group_concat(stat, ',' ORDER BY stat) AS stats
    FROM v_armor_tuning
    GROUP BY instance_id
),
perks AS (
    SELECT instance_id, group_concat(perk, ',' ORDER BY perk) AS names
    FROM v_armor_perk
    GROUP BY instance_id
),
piece AS (
    SELECT a.instance_id, a.armor_class, a.slot, a.set_name, lower(a.name) AS name,
           a.is_exotic, a.gear_tier, a.health, a.melee, a.grenade, a.super_stat,
           a.class_stat, a.weapons, s.preferred_score, t.stats AS tuning,
           CASE WHEN a.slot = 'Class Armor' THEN k.names END AS perks
    FROM v_armor a
    LEFT JOIN armor_score s ON s.instance_id = a.instance_id
    LEFT JOIN tuning t ON t.instance_id = a.instance_id
    LEFT JOIN perks k ON k.instance_id = a.instance_id
),
exact AS (
    SELECT *, FIRST_VALUE(instance_id) OVER same AS original_id, ROW_NUMBER() OVER same AS n
    FROM piece
    WHERE NOT is_exotic AND gear_tier > 0
    WINDOW same AS (
        PARTITION BY armor_class, slot, set_name, health, melee, grenade, super_stat,
                     class_stat, weapons, tuning
        ORDER BY instance_id
    )
),
capped AS (
    SELECT e.instance_id, g.slot_cap,
           FIRST_VALUE(e.instance_id) OVER bucket AS keeper_id, ROW_NUMBER() OVER bucket AS n
    FROM exact e
    LEFT JOIN armor_preference p ON p.name = e.set_name COLLATE NOCASE
    JOIN armor_grade g ON g.grade = COALESCE(p.grade, '')
    WHERE e.n = 1
    WINDOW bucket AS (
        PARTITION BY e.armor_class, e.slot, e.set_name
        ORDER BY e.preferred_score DESC, e.instance_id
    )
),
exotic AS (
    SELECT instance_id, FIRST_VALUE(instance_id) OVER copies AS keeper_id,
           ROW_NUMBER() OVER copies AS n
    FROM piece
    WHERE is_exotic
    WINDOW copies AS (
        PARTITION BY armor_class, name, perks
        ORDER BY preferred_score DESC, instance_id
    )
),
flagged AS (
    SELECT instance_id, 'legacy' AS reason, NULL AS keeper_id
    FROM piece
    WHERE NOT is_exotic AND COALESCE(gear_tier, 0) = 0
    UNION ALL
    SELECT instance_id, 'equal_same_set', original_id FROM exact WHERE n > 1
    UNION ALL
    SELECT instance_id, 'cap_tier', keeper_id FROM capped WHERE n > slot_cap
    UNION ALL
    SELECT instance_id, 'exotic_dupe', keeper_id FROM exotic WHERE n > 1
)
SELECT f.instance_id, f.reason, f.keeper_id,
       EXISTS (SELECT 1 FROM armor_rescue r WHERE r.instance_id = f.instance_id) AS rescued
FROM flagged f;
