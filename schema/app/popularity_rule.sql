-- The thresholds the report applies to d2-perk-popularity's scores, one row.
-- A side's Endgame badge needs at least endgame_copies of a weapon's voting
-- copies on that side from hard content, and at least endgame_share of them.
-- A family with seen_votes or more effective votes in a column (pooled over
-- both sides and all its scored weapons) shows only the perks its copies were
-- seen with there: the manifest lists barrels and magazines that never drop.
-- A perk its plug set lists only after the enhanced copies begin (the set's
-- later block, where most such perks sit) needs only late_votes.
-- A trait row below quiet_rel of its column's top recedes unless something
-- else picks it out (owned, wishlisted, a top pair). The views read it, and
-- the text that names the thresholds reads it too. Kept by hand; the row is
-- part of the view, so a change here rebuilds the database on the next run.
CREATE VIEW popularity_rule (endgame_copies, endgame_share, seen_votes, late_votes, quiet_rel)
AS VALUES (50, 0.3, 100, 30, 0.3);
