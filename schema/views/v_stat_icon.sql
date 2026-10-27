-- The icon of each stat the app names (stat_key), as a full URL; '' for a stat
-- without one.
CREATE VIEW v_stat_icon AS
SELECT k.key,
       CASE WHEN COALESCE(s.icon, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || s.icon END AS icon
FROM stat_key k
JOIN DestinyStatDefinition s ON s.hash = k.statHash;
