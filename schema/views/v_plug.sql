-- Every stored plug as the app shows it: its name, category, icon as a full
-- URL, its description as Bungie wrote it (inline icon tokens included), its
-- kind: the kind of weapon perk socket its category fills, and its label: what
-- the weapon calls that socket. Each weapon type names its barrel and magazine
-- differently (a rocket sidearm's Tube, a bow's String); some weapons, most of
-- them exotics, have a stock or a grip too. A plug whose category isn't a
-- weapon perk (masterworks, mods, shaders, trackers) has no kind or label
-- (NULL).
CREATE VIEW v_plug AS
SELECT hash, COALESCE(name, '') AS name, plugCategoryIdentifier,
       CASE WHEN COALESCE(icon, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || icon END AS icon,
       COALESCE(description, '') AS description,
       CASE
           WHEN plugCategoryIdentifier IN ('barrels', 'scopes', 'tubes', 'bowstrings', 'blades', 'hafts')
               THEN 'barrel'
           WHEN plugCategoryIdentifier IN ('magazines', 'batteries', 'arrows', 'guards', 'magazines_gl')
               THEN 'magazine'
           WHEN plugCategoryIdentifier = 'stocks' THEN 'stock'
           WHEN plugCategoryIdentifier = 'grips' THEN 'grip'
           WHEN plugCategoryIdentifier = 'frames' THEN 'trait'
           WHEN plugCategoryIdentifier = 'origins' THEN 'origin'
           WHEN plugCategoryIdentifier = 'intrinsics' THEN 'intrinsic'
       END AS kind,
       CASE plugCategoryIdentifier
           WHEN 'barrels' THEN 'Barrel' WHEN 'scopes' THEN 'Scope' WHEN 'tubes' THEN 'Tube'
           WHEN 'bowstrings' THEN 'String' WHEN 'blades' THEN 'Blade' WHEN 'hafts' THEN 'Haft'
           WHEN 'magazines' THEN 'Magazine' WHEN 'magazines_gl' THEN 'Magazine'
           WHEN 'batteries' THEN 'Battery' WHEN 'arrows' THEN 'Arrow' WHEN 'guards' THEN 'Guard'
           WHEN 'stocks' THEN 'Stock' WHEN 'grips' THEN 'Grip' WHEN 'frames' THEN 'Trait'
           WHEN 'origins' THEN 'Origin' WHEN 'intrinsics' THEN 'Frame'
       END AS label
FROM DestinyInventoryItemDefinition
WHERE plugCategoryIdentifier IS NOT NULL;
