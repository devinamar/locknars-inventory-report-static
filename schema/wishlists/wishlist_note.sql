-- Curator notes, each stored once and referenced by wishlist_roll.note_id:
-- many rolls share a note (Voltron's ~275K rolls have ~5K distinct notes).
CREATE TABLE wishlist_note (
    note_id  INTEGER PRIMARY KEY,
    text     TEXT NOT NULL UNIQUE
);
