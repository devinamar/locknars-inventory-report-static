-- DestinyPlugSetDefinition: "Sometimes, we have large sets of reusable plugs
-- that are defined identically and thus can (and in some cases, are so large
-- that they *must*) be shared across the places where they are used. These are
-- the definitions for those reusable sets of plugs." A plug set is the list of
-- plugs one socket can hold, such as every barrel a weapon's barrel socket can
-- roll. Rows kept: the sets the stored sockets name. Observed 2026-10-14: the
-- manifest doesn't deduplicate plug sets. 424 lists appeared under two or more
-- hashes, often with one copy in use; each is kept under its own hash.
CREATE TABLE DestinyPlugSetDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash               INTEGER PRIMARY KEY,
    -- reusablePlugItems: "This is a list of pre-determined plugs that can be
    -- plugged into this socket, without the character having the plug in
    -- their inventory. If this list is populated, you will not be allowed to
    -- plug an arbitrary item in the socket: you will only be able to choose
    -- from one of these reusable plugs." A JSON array in the set's order, its
    -- entries holding:
    --   plugItemHash: "The hash identifier of a DestinyInventoryItemDefinition
    --     representing the plug that can be inserted." Kept as sent, so it can
    --     name a plug that isn't stored.
    --   currentlyCanRoll: "Indicates if the plug can be rolled on the current
    --     version of the item. For example, older versions of weapons may have
    --     plug rolls that are no longer possible on the current versions."
    --     true or false.
    -- A set can list a plug twice. Like [{"plugItemHash": 699525795,
    -- "currentlyCanRoll": true}, ...].
    reusablePlugItems  TEXT NOT NULL DEFAULT '[]'
);
