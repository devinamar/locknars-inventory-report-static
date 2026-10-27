-- One row per weapon perk name, as the report shows the perk: the plug that
-- stands for the name (plug_hash: the lowest hash with a Clarity note, else
-- the lowest), its icon, and its text (Clarity's note, else Bungie's
-- description). A perk's base and enhanced versions share the name, and the
-- report treats them as one perk, as d2-perk-popularity scores them.
CREATE VIEW v_perk AS
WITH plug AS (
    SELECT p.name, p.hash, p.icon, COALESCE(cn.text, p.description) AS text,
           ROW_NUMBER() OVER (PARTITION BY p.name ORDER BY cn.text IS NULL, p.hash) AS n
    FROM v_plug p
    LEFT JOIN clarity_note cn ON cn.plug_hash = p.hash
    WHERE p.kind IS NOT NULL AND p.name != ''
)
SELECT name AS perk, hash AS plug_hash, icon, text
FROM plug
WHERE n = 1;
