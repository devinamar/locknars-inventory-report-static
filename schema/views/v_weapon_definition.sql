-- One row per weapon definition (a version), with what the report shows of it
-- before any copy. family_name is the name without " (Adept)", " (Timelost)"
-- or " (Harrowed)", so special editions group with the base weapon; slot is
-- the name of the weapon's bucket and slot_order its bucketOrder, Bungie's
-- order for the buckets. The season comes from the weapon's release traits (a
-- '.season' trait first, then '.annual', then any other, in
-- release_tag_season); 0 and '' when none is known. source is where it drops,
-- as its collection entry says ('' when it has none, or when Bungie's text
-- there, "Random Perks: ...", names no place). ammo is the weapon's ammo type
-- (primary, special or heavy; '' when unknown) and ammo_icon Bungie's badge
-- for it. element is the weapon's default damage type and element_icon its
-- icon; archetype is the intrinsic socket 0 starts with; tier is the tierType
-- (5 is Legendary, 6 Exotic). wtype_icon is the weapon type's picture: the
-- icon of the Gunsmith Order named after the type ("Hand Cannons"; "Bows" for
-- a Combat Bow), '' when no order has the name.
CREATE VIEW v_weapon_definition AS
WITH by_trait AS (
    SELECT d.hash, r.season_num, r.season_name, r.season_date,
           ROW_NUMBER() OVER (PARTITION BY d.hash ORDER BY
               CASE WHEN t.value LIKE '%.season' THEN 0
                    WHEN t.value LIKE '%.annual' THEN 1
                    ELSE 2 END,
               t.key) AS n
    FROM DestinyInventoryItemDefinition d, json_each(d.traitIds) t
    JOIN release_tag_season r ON r.traitId = t.value
    WHERE d.itemType = 3
),
type_icon AS (
    SELECT name, MIN(icon) AS icon
    FROM DestinyInventoryItemDefinition
    WHERE itemTypeDisplayName = 'Gunsmith Order' AND icon <> ''
    GROUP BY name
)
SELECT d.hash AS item_hash, COALESCE(d.name, '') AS name,
       CASE WHEN substr(d.name, -8) = ' (Adept)'
                THEN trim(substr(d.name, 1, length(d.name) - 8))
            WHEN substr(d.name, -11) IN (' (Timelost)', ' (Harrowed)')
                THEN trim(substr(d.name, 1, length(d.name) - 11))
            ELSE COALESCE(d.name, '') END AS family_name,
       COALESCE(b.name, 'Unknown') AS slot, COALESCE(b.bucketOrder, 0) AS slot_order,
       COALESCE(d.itemTypeDisplayName, 'Unknown') AS wtype,
       COALESCE('https://www.bungie.net' || ti.icon, '') AS wtype_icon,
       COALESCE(d.tierType, 0) AS tier,
       CASE WHEN COALESCE(d.icon, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || d.icon END AS icon,
       CASE WHEN COALESCE(d.iconWatermark, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || d.iconWatermark END AS watermark,
       COALESCE(d.tierType, 0) = 6 AS is_exotic,
       COALESCE(NULLIF(c.sourceString,
           'Random Perks: This item cannot be reacquired from Collections.'), '') AS source,
       COALESCE(bt.season_num, 0) AS season_num,
       COALESCE(bt.season_name, '') AS season_name,
       COALESCE(bt.season_date, '') AS season_date,
       CASE d.ammoType WHEN 1 THEN 'primary' WHEN 2 THEN 'special' WHEN 3 THEN 'heavy'
            ELSE '' END AS ammo,
       COALESCE('https://www.bungie.net/img/destiny_content/ammo_types/'
                || CASE d.ammoType WHEN 1 THEN 'primary' WHEN 2 THEN 'special'
                                   WHEN 3 THEN 'heavy' END || '.png', '') AS ammo_icon,
       COALESCE(dt.name, 'Unknown') AS element,
       CASE WHEN COALESCE(dt.icon, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || dt.icon END AS element_icon,
       COALESCE(NULLIF(ip.name, ''), 'Unknown') AS archetype,
       COALESCE(ip.icon, '') AS archetype_icon
FROM DestinyInventoryItemDefinition d
LEFT JOIN DestinyInventoryBucketDefinition b ON b.hash = d.bucketTypeHash
LEFT JOIN DestinyCollectibleDefinition c ON c.hash = d.collectibleHash
LEFT JOIN by_trait bt ON bt.hash = d.hash AND bt.n = 1
LEFT JOIN DestinyDamageTypeDefinition dt ON dt.hash = d.defaultDamageTypeHash
LEFT JOIN v_plug ip ON ip.hash = d.socketEntries ->> '$[0].singleInitialItemHash'
LEFT JOIN type_icon ti ON ti.name = CASE d.itemTypeDisplayName
    WHEN 'Combat Bow' THEN 'Bows' ELSE d.itemTypeDisplayName || 's' END
WHERE d.itemType = 3;
