-- DestinyItemReusablePlugsComponent (component 310). Bungie gives the
-- component no description. One row per copy the profile sends it for.
CREATE TABLE DestinyItemReusablePlugsComponent (
    -- The copy these plugs belong to.
    itemInstanceId  TEXT PRIMARY KEY
        REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    -- plugs: "the list of plugs that are allowed to be used for the socket,
    -- and any relevant information about whether they are "enabled", whether
    -- they are allowed to be inserted". "KEY = The INDEX into the item's list
    -- of sockets. VALUE = The set of plugs for that socket. If a socket
    -- doesn't have any reusable plugs defined at the item scope, there will be
    -- no entry for that socket." A JSON object from socket index (as text) to
    -- its plugs in the game's order, each a DestinyItemPlugBase holding the
    -- field the app reads:
    --   plugItemHash: "The hash identifier of the
    --     DestinyInventoryItemDefinition that represents this plug."
    -- Hashes are kept as sent, so one can name a plug the db doesn't store.
    -- Like {"1": [{"plugItemHash": 1840239774}, {"plugItemHash": 202670084}],
    -- ...}.
    plugs           TEXT NOT NULL DEFAULT '{}'
);
