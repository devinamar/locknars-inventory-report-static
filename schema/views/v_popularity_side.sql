-- The two sides d2-perk-popularity scores, as the report badges them: the
-- side's label, the icon of the activity mode its Endgame badge shows (Raid
-- for PvE, Trials of Osiris for PvP), and hard, the labels of the side's hard
-- content categories in the published order, which its badge's tooltip names.
CREATE VIEW v_popularity_side AS
WITH side (side, label, mode_type) AS (
    VALUES ('pve', 'PvE', 4), ('pvp', 'PvP', 84)
)
SELECT s.side, s.label,
       COALESCE((SELECT 'https://www.bungie.net' || MIN(m.icon)
                 FROM DestinyActivityModeDefinition m
                 WHERE m.modeType = s.mode_type AND COALESCE(m.icon, '') != ''), '') AS icon,
       COALESCE((SELECT group_concat(c.value ->> 'label', ', ' ORDER BY c.key)
                 FROM perk_popularity_file f
                 CROSS JOIN json_each(f.categories) c
                 WHERE c.value ->> 'side' = s.side AND c.value ->> 'hard'), '') AS hard
FROM side s;
