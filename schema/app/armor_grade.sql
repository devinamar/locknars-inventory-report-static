-- The armor set grades, best first (position), each with its label and
-- slot_cap: how many copies of each slot a set of that grade keeps, per class.
-- A set's grade is in its armor preference; a set without one is Unclassified
-- (grade ''). The vault holds 1300 items, and one copy of every set in every
-- slot, for all three classes, takes most of it, so only the better grades
-- keep more. The extra copies are the next-best rolls on the set's own stat
-- picks; pieces other builds need are kept by the triple-100 rescue. Kept by
-- hand; the rows are part of the view, so a change here rebuilds the database
-- on the next run.
CREATE VIEW armor_grade (grade, label, slot_cap, position) AS VALUES
    ('S', 'Best-in-class', 4, 1),
    ('A', 'Excellent', 2, 2),
    ('B', 'Good', 2, 3),
    ('C', 'Situational', 1, 4),
    ('D', 'Weak', 1, 5),
    ('E', 'Marginal', 1, 6),
    ('F', 'No PvE value', 1, 7),
    ('', 'Unclassified', 1, 8);
