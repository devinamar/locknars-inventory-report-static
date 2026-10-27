-- DestinyItemSocketsComponent (component 305): "Instanced items can have
-- sockets, which are slots on the item where plugs can be inserted." One row
-- per copy the profile sends sockets for.
CREATE TABLE DestinyItemSocketsComponent (
    -- The copy these sockets belong to.
    itemInstanceId  TEXT PRIMARY KEY
        REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    -- sockets: "The list of all sockets on the item, and their status
    -- information." A JSON array in socket order (an entry's position is the
    -- socket index the definition's socketEntries use), each a
    -- DestinyItemSocketState ("The status of a given item's socket.") holding
    -- the field the app reads, when Bungie sends it:
    --   plugHash: "The currently active plug, if any. Note that, because all
    --     plugs are statically defined, its effect on stats and perks can be
    --     statically determined using the plug item's definition."
    -- An empty socket is {}. Hashes are kept as sent, so one can name a plug
    -- the db doesn't store. Like [{"plugHash": 886865893}, {}, ...].
    sockets         TEXT NOT NULL DEFAULT '[]'
);
