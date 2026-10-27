-- The intrinsic perks plugged into each armor copy: an exotic's perk, or an
-- exotic class item's two "Spirit of..." perks. Legendary armor has none.
CREATE VIEW v_armor_perk AS
SELECT s.itemInstanceId AS instance_id, p.name AS perk
FROM DestinyItemSocketsComponent s
JOIN DestinyItemComponent i ON i.itemInstanceId = s.itemInstanceId
JOIN DestinyInventoryItemDefinition d ON d.hash = i.itemHash AND d.itemType = 2
CROSS JOIN json_each(s.sockets) so
CROSS JOIN DestinyInventoryItemDefinition p ON p.hash = so.value ->> 'plugHash'
WHERE p.plugCategoryIdentifier = 'intrinsics' AND p.name != '';
