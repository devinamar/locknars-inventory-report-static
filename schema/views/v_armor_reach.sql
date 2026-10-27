-- How far each class's kept Legendary armor takes each three-stat build: for each
-- class, build (its stats in stat order) and slot, the kept piece whose lowest
-- value of the three is highest, then whose total is, then the lower
-- itemInstanceId, with its raw values (no masterwork or tuning) and the
-- build's totals over the slots. Kept: a non-exotic piece v_armor_pruning
-- doesn't flag, or rescued there. The rescue aims for 100 in each stat.
CREATE VIEW v_armor_reach AS
WITH stat (n, name) AS (
    VALUES (1, 'health'), (2, 'melee'), (3, 'grenade'), (4, 'super_stat'), (5, 'class_stat'),
           (6, 'weapons')
),
build AS (
    SELECT a.name AS stat_1, b.name AS stat_2, c.name AS stat_3
    FROM stat a JOIN stat b ON b.n > a.n JOIN stat c ON c.n > b.n
),
kept AS (
    SELECT a.instance_id, a.armor_class, a.slot,
           json_object('health', a.health, 'melee', a.melee, 'grenade', a.grenade,
                       'super_stat', a.super_stat, 'class_stat', a.class_stat,
                       'weapons', a.weapons) AS stats
    FROM v_armor a
    LEFT JOIN v_armor_pruning p ON p.instance_id = a.instance_id
    WHERE NOT a.is_exotic AND COALESCE(p.rescued, 1)
),
value AS (
    SELECT k.armor_class, b.stat_1, b.stat_2, b.stat_3, k.slot, k.instance_id,
           k.stats ->> b.stat_1 AS value_1, k.stats ->> b.stat_2 AS value_2,
           k.stats ->> b.stat_3 AS value_3
    FROM kept k, build b
),
best AS (
    SELECT *, ROW_NUMBER() OVER (
        PARTITION BY armor_class, stat_1, stat_2, stat_3, slot
        ORDER BY MIN(value_1, value_2, value_3) DESC, value_1 + value_2 + value_3 DESC,
                 instance_id
    ) AS n
    FROM value
)
SELECT armor_class, stat_1, stat_2, stat_3, slot, instance_id, value_1, value_2, value_3,
       SUM(value_1) OVER builds AS total_1, SUM(value_2) OVER builds AS total_2,
       SUM(value_3) OVER builds AS total_3
FROM best
WHERE n = 1
WINDOW builds AS (PARTITION BY armor_class, stat_1, stat_2, stat_3);
