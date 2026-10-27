-- Each weapon copy's perks per socket (v_weapon_roll), with col, the column
-- d2-perk-popularity scores the socket in, keyed as v_weapon_pool's: the kind,
-- the copy's trait sockets numbered trait1 and trait2 in socket order.
CREATE VIEW v_copy_perk AS
SELECT r.instance_id, r.socket_idx, r.kind,
       CASE WHEN r.kind = 'trait'
            THEN 'trait' || DENSE_RANK() OVER (PARTITION BY r.instance_id, r.kind
                                               ORDER BY r.socket_idx)
            ELSE r.kind END AS col,
       r.perk, r.plug_hash, r.position
FROM v_weapon_roll r;
