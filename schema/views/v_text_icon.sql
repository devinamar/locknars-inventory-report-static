-- The icon for each inline token in Bungie's text, such as [Arc] or [Stagger],
-- that names a damage type, a champion breaker type or a stat the app reads
-- (the ability stats [Grenade], [Melee] and [Super]), as a full URL. The text
-- writes the breaker type Shield Piercing as [Shield-Piercing]. Other tokens
-- have no icon here: for a button prompt such as [Light Attack], the game shows
-- the player's own binding.
CREATE VIEW v_text_icon AS
SELECT '[' || name || ']' AS token, 'https://www.bungie.net' || icon AS icon
FROM DestinyDamageTypeDefinition
WHERE COALESCE(icon, '') != ''
UNION
SELECT '[' || replace(name, ' ', '-') || ']', 'https://www.bungie.net' || icon
FROM DestinyBreakerTypeDefinition
WHERE COALESCE(icon, '') != ''
UNION
SELECT '[' || s.name || ']', 'https://www.bungie.net' || s.icon
FROM stat_key k
JOIN DestinyStatDefinition s ON s.hash = k.statHash
WHERE COALESCE(s.icon, '') != '';
