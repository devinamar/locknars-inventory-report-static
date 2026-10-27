-- One row per armor copy, with its definition. slot is the name of the armor's
-- bucket and slot_order its bucketOrder, Bungie's order for the buckets;
-- armor_class is the name of its classType (DestinyClassDefinition).
-- set_name is the armor set's name, or for armor outside a set (exotics, older
-- armor) the item name without its last word when that word names a slot
-- ("Frumious Vest" -> "Frumious"). two_pc and four_pc are the set's bonuses,
-- each perk's name and text as Bungie wrote it; NULL outside a set. The base
-- stats add up every plug of category intrinsics or armor_stats: the stat
-- rolls, and any intrinsic that adds stats, such as an exotic class item's
-- "Spirit of" perk. Mods, masterwork and tuning have other categories, so
-- they don't count. The exotic perk is the first starting plug in an
-- intrinsic socket that has text. icon and watermark are the item's icon and
-- season badge as full URLs. The stats a copy's tuning socket can raise are in
-- v_armor_tuning.
CREATE VIEW v_armor AS
WITH armor AS (
    -- Each armor definition's name ('Unknown Armor' when it has none) and that
    -- name without its last word when the word names a slot. rtrim(name,
    -- replace(name, ' ', '')) cuts the last word off the name.
    SELECT hash, name,
           CASE WHEN instr(name, ' ') > 0
                 AND lower(substr(name, length(rtrim(name, replace(name, ' ', ''))) + 1)) IN (
                     -- Helmet
                     'cover', 'helm', 'helmet', 'mask', 'hood', 'cowl', 'crown', 'visor',
                     'casque', 'cap', 'cage', 'crest',
                     -- Gauntlets
                     'gauntlets', 'grips', 'gloves', 'grasps', 'vambraces', 'wraps', 'clutch',
                     'fists', 'sleeves', 'armlets', 'bracers',
                     -- Chest
                     'chestplate', 'plate', 'vest', 'robes', 'robe', 'vestment', 'cuirass',
                     'hauberk', 'jacket', 'harness', 'suit', 'jerkin',
                     -- Legs
                     'greaves', 'strides', 'boots', 'steps', 'treads', 'legguards', 'legs',
                     -- Class item
                     'mark', 'cloak', 'bond', 'cape')
                THEN rtrim(rtrim(name, replace(name, ' ', '')))
                ELSE name END AS name_without_slot
    FROM (SELECT hash,
                 CASE WHEN COALESCE(name, '') = '' THEN 'Unknown Armor' ELSE name END AS name
          FROM DestinyInventoryItemDefinition
          WHERE itemType = 2)
),
set_bonus AS (
    SELECT es.hash AS equipableItemSetHash,
           MAX(CASE WHEN sp.value ->> 'requiredSetCount' = 2
                    THEN sb.name || ': ' || COALESCE(sb.description, '') END) AS two_pc,
           MAX(CASE WHEN sp.value ->> 'requiredSetCount' = 4
                    THEN sb.name || ': ' || COALESCE(sb.description, '') END) AS four_pc
    FROM DestinyEquipableItemSetDefinition es
    CROSS JOIN json_each(es.setPerks) sp
    CROSS JOIN DestinySandboxPerkDefinition sb ON sb.hash = sp.value ->> 'sandboxPerkHash'
    WHERE COALESCE(sb.name, '') != ''
    GROUP BY es.hash
),
base AS (
    SELECT s.itemInstanceId, k.key, SUM(inv.value ->> 'value') AS value
    FROM DestinyItemSocketsComponent s
    CROSS JOIN json_each(s.sockets) so
    CROSS JOIN DestinyInventoryItemDefinition p ON p.hash = so.value ->> 'plugHash'
    CROSS JOIN json_each(p.investmentStats) inv
    CROSS JOIN stat_key k ON k.statHash = inv.value ->> 'statTypeHash'
    WHERE p.plugCategoryIdentifier IN ('intrinsics', 'armor_stats')
    GROUP BY s.itemInstanceId, k.key
),
exotic_perk AS (
    SELECT itemHash, name, description, icon FROM (
        SELECT d.hash AS itemHash, p.name, p.description, p.icon,
               ROW_NUMBER() OVER (PARTITION BY d.hash ORDER BY ds.key) AS n
        FROM DestinyInventoryItemDefinition d
        CROSS JOIN json_each(d.socketEntries) ds
        CROSS JOIN v_plug p ON p.hash = ds.value ->> 'singleInitialItemHash'
        WHERE d.itemType = 2 AND d.tierType = 6 AND p.plugCategoryIdentifier = 'intrinsics' AND (p.name != '' OR p.description != ''))
    WHERE n = 1
)
SELECT i.itemInstanceId AS instance_id, i.itemHash AS item_hash,
       a.name, COALESCE(b.name, 'Unknown') AS slot, COALESCE(b.bucketOrder, 0) AS slot_order,
       COALESCE(c.name, 'Unknown') AS armor_class,
       COALESCE(NULLIF(es.name, ''), a.name_without_slot) AS set_name,
       d.equipableItemSetHash AS set_hash,
       CASE WHEN es.hash IS NOT NULL THEN COALESCE(sb.two_pc, '') END AS two_pc,
       CASE WHEN es.hash IS NOT NULL THEN COALESCE(sb.four_pc, '') END AS four_pc,
       COALESCE(d.tierType, 0) AS tier, COALESCE(d.tierType, 0) = 6 AS is_exotic,
       CASE WHEN COALESCE(d.icon, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || d.icon END AS icon,
       CASE WHEN COALESCE(d.iconWatermark, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || d.iconWatermark END AS watermark,
       COALESCE(ep.name, '') AS exotic_perk_name,
       COALESCE(ep.description, '') AS exotic_perk_desc,
       COALESCE(ep.icon, '') AS exotic_perk_icon,
       COALESCE(MAX(CASE WHEN bs.key = 'health' THEN bs.value END), 0) AS health,
       COALESCE(MAX(CASE WHEN bs.key = 'melee' THEN bs.value END), 0) AS melee,
       COALESCE(MAX(CASE WHEN bs.key = 'grenade' THEN bs.value END), 0) AS grenade,
       COALESCE(MAX(CASE WHEN bs.key = 'super_stat' THEN bs.value END), 0) AS super_stat,
       COALESCE(MAX(CASE WHEN bs.key = 'class_stat' THEN bs.value END), 0) AS class_stat,
       COALESCE(MAX(CASE WHEN bs.key = 'weapons' THEN bs.value END), 0) AS weapons,
       COALESCE(n.value, 0) AS power, n.gearTier AS gear_tier, i.state & 1 AS is_locked,
       COALESCE(n.isEquipped, 0) AS is_equipped
FROM DestinyItemComponent i
JOIN DestinyInventoryItemDefinition d ON d.hash = i.itemHash AND d.itemType = 2
JOIN armor a ON a.hash = i.itemHash
LEFT JOIN DestinyItemInstanceComponent n ON n.itemInstanceId = i.itemInstanceId
LEFT JOIN DestinyInventoryBucketDefinition b ON b.hash = d.bucketTypeHash
LEFT JOIN DestinyClassDefinition c ON c.classType = d.classType
LEFT JOIN DestinyEquipableItemSetDefinition es ON es.hash = d.equipableItemSetHash
LEFT JOIN set_bonus sb ON sb.equipableItemSetHash = es.hash
LEFT JOIN exotic_perk ep ON ep.itemHash = i.itemHash
LEFT JOIN base bs ON bs.itemInstanceId = i.itemInstanceId
GROUP BY i.itemInstanceId;
