-- Each wishlist roll's perks by name, one row per roll and perk: the roll, its
-- list (source_key) and the list's place (1 for the first in
-- wishlist_preference's order, which sets its colour), the item it names
-- (the wildcard, -69420, for every weapon), whether it is a trash roll, and
-- the perk. Rolls match copies by perk name, never hash, since reissues change
-- hashes but keep names. A roll naming no perks has no rows.
CREATE VIEW v_wishlist_perk AS
SELECT r.roll_id, r.source_key, l.place, r.item_hash, r.is_trash, d.name AS perk
FROM wishlist_roll r
JOIN (SELECT key, ROW_NUMBER() OVER (ORDER BY rowid) AS place FROM wishlist_preference) l
    ON l.key = r.source_key
JOIN DestinyInventoryItemDefinition d
    ON d.hash IN (r.perk1, r.perk2, r.perk3, r.perk4, r.perk5, r.perk6)
WHERE d.name != '';
