-- DestinyInventoryItemDefinition: "So much of what you see in Destiny is
-- actually an Item used in a new and creative way. This is the definition for
-- Items in Destiny, which started off as just entities that could exist in
-- your Inventory but ended up being the backing data for so much more: quests,
-- reward previews, slots, and subclasses. In practice, you will want to
-- associate this data with "live" item data from a Bungie.Net Platform call:
-- these definitions describe the item in generic, non-instanced terms: but an
-- actual instance of an item can vary widely from these generic definitions."
-- Rows kept: weapons (itemType 3), armor (itemType 2 in one of the five armor
-- buckets), every plug (an item with a plug block; one item can be both) and
-- the Gunsmith Orders, whose icons picture the weapon types (v_weapon).
CREATE TABLE DestinyInventoryItemDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash                    INTEGER PRIMARY KEY,
    -- displayProperties.name: The name shown in game. Bungie's documentation
    -- gives no description.
    name                    TEXT,
    -- displayProperties.description: the description shown in game, with
    -- Bungie's inline icon tokens such as [Arc] (v_text_icon has their icons).
    -- Bungie's documentation gives no description.
    description             TEXT,
    -- displayProperties.icon: "Note that "icon" is sometimes misleading, and
    -- should be interpreted in the context of the entity. For instance, in
    -- Destiny 1 the DestinyRecordBookDefinition's icon was a big picture of a
    -- book. But usually, it will be a small square image that you can use
    -- as... well, an icon. They are currently represented as 96px x 96px
    -- images." A path on www.bungie.net.
    icon                    TEXT,
    -- "A value indicating the "base" the of the item. This enum is a useful
    -- but dramatic oversimplification of what it means for an item to have a
    -- "Type". Still, it's handy in many situations. itemCategoryHashes are the
    -- preferred way of identifying types, we have retained this enum for its
    -- convenience." Destiny.DestinyItemType: 2 Armor, 3 Weapon.
    itemType                INTEGER,
    -- "The localized title/name of the item's type. This can be whatever the
    -- designers want, and has no guarantee of consistency between items." For
    -- example 'Hand Cannon'.
    itemTypeDisplayName     TEXT,
    -- "We run a similarly weak-sauce algorithm to try and determine whether an
    -- item is restricted to a specific class. If we find it to be restricted
    -- in such a way, we set this classType property to match the class'
    -- enumeration value so that users can easily identify class restricted
    -- items. If you see a mis-classed item, please inform the developers in
    -- the Bungie API forum." DestinyClassDefinition.classType: 0 Titan, 1
    -- Hunter, 2 Warlock, 3 any class.
    classType               INTEGER,
    -- inventory.tierType: "The enumeration matching the tier type of the item
    -- to known values, again for convenience sake." Destiny.TierType: 4 Rare,
    -- 5 Superior (the game's Legendary), 6 Exotic.
    tierType                INTEGER,
    -- inventory.bucketTypeHash: "The hash identifier for the
    -- DestinyInventoryBucketDefinition to which this item belongs. I should
    -- have named this "bucketHash", but too many things refer to it now.
    -- Sigh." Not a foreign key: only the weapon and armor buckets are stored.
    bucketTypeHash          INTEGER,
    -- equippingBlock.equipableItemSetHash: "If this item is part of an item
    -- set with bonus perks, this will the hash of that set."
    equipableItemSetHash    INTEGER REFERENCES DestinyEquipableItemSetDefinition(hash),
    -- equippingBlock.ammoType: "Ammo type used by a weapon is no longer
    -- determined by the bucket in which it is contained. If the item has an
    -- ammo type - i.e. if it is a weapon - this will be the type of ammunition
    -- expected." Destiny.DestinyAmmunitionType: 1 Primary, 2 Special, 3 Heavy.
    ammoType                INTEGER,
    -- "Similar to defaultDamageType, but represented as the hash identifier
    -- for a DestinyDamageTypeDefinition. I will likely regret leaving in the
    -- enumeration versions of these properties, but for now they're very
    -- convenient."
    defaultDamageTypeHash   INTEGER REFERENCES DestinyDamageTypeDefinition(hash),
    -- "If available, this is the original 'active' release watermark overlay
    -- for the icon. If the item has different versions, this can be overridden
    -- by the 'display version watermark icon' from the 'quality' block.
    -- Alternatively, if there is no watermark for the version, and the item
    -- version has a power cap below the current season power cap, this can be
    -- overridden by the iconWatermarkShelved property." A path on
    -- www.bungie.net.
    iconWatermark           TEXT,
    -- "If this item has a collectible related to it, this is the hash
    -- identifier of that collectible entry." Not a foreign key: only the
    -- weapons' collectibles are stored.
    collectibleHash         INTEGER,
    -- "Traits are metadata tags applied to this item. For example: armor slot,
    -- weapon type, foundry, faction, etc. These IDs come from the game and
    -- don't map to any content, but should still be useful." A JSON array,
    -- such as ["releases.v710.season"].
    traitIds                TEXT,
    -- plug.plugCategoryIdentifier: "The string identifier for the plug's
    -- category. Use the socket's DestinySocketTypeDefinition.plugWhitelist to
    -- determine whether this plug can be inserted into the socket." NULL for
    -- an item that isn't a plug.
    plugCategoryIdentifier  TEXT,
    -- sockets.socketEntries: "Each non-intrinsic (or mutable) socket on an
    -- item is defined here." Kept for weapons and armor; [] for other items,
    -- whose sockets nothing reads. A JSON array in socket order (a copy's
    -- sockets use the same index), each entry a DestinyItemSocketEntryDefinition
    -- ("The definition information for a specific socket on an item. This
    -- will determine how the socket behaves in-game.") holding the fields the
    -- app reads, each when Bungie sends it:
    --   singleInitialItemHash: "If a valid hash, this is the hash identifier
    --     for the DestinyInventoryItemDefinition representing the Plug that
    --     will be initially inserted into the item on item creation.
    --     Otherwise, this Socket will either start without a plug inserted, or
    --     will have one randomly inserted." 0 for a socket that starts empty.
    --   randomizedPlugSetHash: "If a socket has randomized plugs, this is a
    --     pointer to the set of plugs that could be used, as defined in
    --     DestinyPlugSetDefinition. If null, the item has no randomized plugs."
    --   reusablePlugSetHash: "If this socket's plugs come from a reusable
    --     DestinyPlugSetDefinition, this is the identifier for that set."
    --   reusablePlugItems: "This is a list of pre-determined plugs that can
    --     *always* be plugged into this socket, without the character having
    --     the plug in their inventory." Kept only on a socket that names
    --     neither plug set, where it is the only list of the socket's options
    --     (most weapons' origin trait sockets); each entry keeps
    --     plugItemHash: "The hash identifier of a
    --     DestinyInventoryItemDefinition representing the plug that can be
    --     inserted."
    -- Hashes are kept as sent, so one can name a plug or set that isn't
    -- stored. Like [{"singleInitialItemHash": 1482024992,
    -- "randomizedPlugSetHash": 2044988252}, ...].
    socketEntries           TEXT NOT NULL DEFAULT '[]',
    -- investmentStats: "If the item has stats, this block will be defined. It
    -- has the "raw" investment stats for the item." Kept for plugs, where it
    -- is what the plug adds to the item it's plugged into: an armor stat
    -- plug's roll, a tuning mod's +5 and -5. [] for other items, whose raw
    -- stats nothing reads. A JSON array of DestinyItemInvestmentStatDefinition
    -- ("Represents a "raw" investment stat, before calculated stats are
    -- calculated and before any DestinyStatGroupDefinition is applied to
    -- transform the stat into something closer to what you see in-game."):
    --   statTypeHash: "The hash identifier for the DestinyStatDefinition
    --     defining this stat."
    --   value: "The raw "Investment" value for the stat, before
    --     transformations are performed to turn this raw stat into stats that
    --     are displayed in the game UI."
    -- A plug can list the same stat twice. Like [{"statTypeHash": 1735777505,
    -- "value": 5}, {"statTypeHash": 4244567218, "value": -5}].
    investmentStats         TEXT NOT NULL DEFAULT '[]'
);
