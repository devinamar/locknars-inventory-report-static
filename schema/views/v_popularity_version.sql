-- Each weapon version d2-perk-popularity scores (a definition's hash), with
-- the scored weapon it counts toward (perk_popularity_weapon's name: its
-- family's, or one trait pool of the family) and the family. A weapon lists
-- the same versions on both sides, so each version has one row. grid_id, the
-- weapon's lowest version hash, names the weapon's perk grid in the report.
CREATE VIEW v_popularity_version AS
SELECT DISTINCT v.value AS item_hash, w.name, w.family,
       MIN(v.value) OVER (PARTITION BY w.name) AS grid_id
FROM perk_popularity_weapon w
CROSS JOIN json_each(w.item_hashes) v;
