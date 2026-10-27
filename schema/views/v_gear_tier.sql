-- The pip image for each gear tier, 1 to 5, as a full URL: the paths in
-- DestinyInventoryItemConstantsDefinition.gearTierOverlayImagePaths, the first
-- for tier 1.
CREATE VIEW v_gear_tier AS
SELECT p.key + 1 AS tier, 'https://www.bungie.net' || p.value AS url
FROM DestinyInventoryItemConstantsDefinition c, json_each(c.gearTierOverlayImagePaths) p
WHERE p.key < 5 AND COALESCE(p.value, '') != '';
