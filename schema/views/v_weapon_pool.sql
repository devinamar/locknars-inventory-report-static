-- The perks each weapon definition can roll in each of its perk sockets: the
-- socket's plug set, randomized or fixed, or for a socket naming neither, its
-- inline list (most origin traits' sockets). can_roll is 0 for a perk the set
-- still lists but no longer drops; a perk the set lists twice can roll if
-- either entry can. position is its place in the set or list (the first, for a
-- perk listed twice), the order the game and DIM show the perks in. col is the
-- column d2-perk-popularity scores the socket's perks in: its kind, with the
-- trait sockets numbered trait1 and trait2 in socket order. Each stored plug
-- set is expanded once, then joined to the sockets that name it. Compared with
-- v_weapon_roll, it shows where a copy's roll sits in what the weapon could
-- have rolled.
CREATE VIEW v_weapon_pool AS
WITH set_perk AS MATERIALIZED (
    SELECT ps.hash AS plug_set, e.key AS position, p.hash AS plug_hash, p.kind, p.name,
           COALESCE(e.value ->> 'currentlyCanRoll', 1) AS can_roll
    FROM DestinyPlugSetDefinition ps
    CROSS JOIN json_each(ps.reusablePlugItems) e
    CROSS JOIN v_plug p ON p.hash = e.value ->> 'plugItemHash'
    WHERE p.kind IS NOT NULL AND p.name != ''
),
socket_perk AS (
    SELECT d.hash AS item_hash, ds.key AS socket_idx, s.kind, s.name, s.plug_hash, s.can_roll,
           s.position
    FROM DestinyInventoryItemDefinition d
    CROSS JOIN json_each(d.socketEntries) ds
    CROSS JOIN set_perk s
        ON s.plug_set = COALESCE(ds.value ->> 'randomizedPlugSetHash',
                                 ds.value ->> 'reusablePlugSetHash')
    WHERE d.itemType = 3
    UNION ALL
    SELECT d.hash, ds.key, p.kind, p.name, p.hash, 1, e.key
    FROM DestinyInventoryItemDefinition d
    CROSS JOIN json_each(d.socketEntries) ds
    CROSS JOIN json_each(ds.value, '$.reusablePlugItems') e
    CROSS JOIN v_plug p ON p.hash = e.value ->> 'plugItemHash'
    WHERE d.itemType = 3 AND p.kind IS NOT NULL AND p.name != ''
),
perk AS (
    SELECT item_hash, socket_idx, kind, name, plug_hash, MAX(can_roll) AS can_roll,
           MIN(position) AS position
    FROM socket_perk
    GROUP BY item_hash, socket_idx, plug_hash
)
SELECT item_hash, socket_idx, kind,
       CASE WHEN kind = 'trait'
            THEN 'trait' || DENSE_RANK() OVER (PARTITION BY item_hash, kind ORDER BY socket_idx)
            ELSE kind END AS col,
       name AS perk, plug_hash, can_roll, position
FROM perk;
