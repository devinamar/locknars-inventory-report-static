-- The app's name for each stat it reads (api_mappings.STAT_KEYS): the six
-- armor stats and 'rpm'. Written every run; the views read it.
CREATE TABLE stat_key (
    -- The stat; a stat has at most one app name.
    statHash  INTEGER PRIMARY KEY REFERENCES DestinyStatDefinition(hash),
    -- The app's name, such as 'health' or 'rpm'.
    key       TEXT NOT NULL UNIQUE
);
