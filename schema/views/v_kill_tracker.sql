-- The kill trackers on each weapon copy and the count each keeps. A copy can
-- switch between its trackers (Kill Tracker for enemies, Crucible Tracker for
-- players, a crafted weapon's memento tracker); each keeps its own count, and
-- is_plugged marks the one the game shows. Every tracker objective is an
-- Integer (inProgressValueStyle 6), so kills is a plain count. kind is what the
-- objective counts, as DIM reads it (its killTrackerObjectivesByHash): 'PvE',
-- 'PvP' or 'Gambit', NULL for one DIM doesn't count, such as a raid memento's.
-- icon is the objective's badge (a shield for enemies, crossed swords for
-- Crucible opponents) as a full URL.
CREATE VIEW v_kill_tracker AS
SELECT o.itemInstanceId AS instance_id, p.name AS tracker,
       CASE ob.value ->> 'objectiveHash'
           WHEN 90275515 THEN 'PvE' WHEN 2579044636 THEN 'PvE' WHEN 73837075 THEN 'PvE'
           WHEN 3387796140 THEN 'PvE'
           WHEN 1501870536 THEN 'PvP' WHEN 2439952408 THEN 'PvP' WHEN 74070459 THEN 'PvP'
           WHEN 890482414 THEN 'PvP' WHEN 2109364169 THEN 'PvP'
           WHEN 345540971 THEN 'Gambit'
       END AS kind,
       CASE WHEN COALESCE(od.icon, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || od.icon END AS icon,
       COALESCE(od.progressDescription, '') AS description,
       COALESCE(ob.value ->> 'progress', 0) AS kills,
       EXISTS (
           SELECT 1 FROM DestinyItemSocketsComponent s
           CROSS JOIN json_each(s.sockets) so
           WHERE s.itemInstanceId = o.itemInstanceId AND so.value ->> 'plugHash' = p.hash
       ) AS is_plugged
FROM DestinyItemPlugObjectivesComponent o
CROSS JOIN json_each(o.objectivesPerPlug) pl
CROSS JOIN json_each(pl.value) ob
CROSS JOIN DestinyInventoryItemDefinition p ON p.hash = CAST(pl.key AS INTEGER)
CROSS JOIN DestinyObjectiveDefinition od ON od.hash = ob.value ->> 'objectiveHash'
WHERE p.plugCategoryIdentifier = 'v400.plugs.weapons.masterworks.trackers';
