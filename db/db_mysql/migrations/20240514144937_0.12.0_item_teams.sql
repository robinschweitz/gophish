-- +goose Up
CREATE TABLE IF NOT EXISTS item_teams (
    `team_id` INTEGER,
    `item_id` INTEGER
);

CREATE TABLE IF NOT EXISTS items (
    `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
    `item_type` VARCHAR(255),
    `item_type_id` INTEGER
);

INSERT INTO items (item_type, item_type_id) SELECT "campaigns", id FROM campaigns;
INSERT INTO items (item_type, item_type_id) SELECT "pages", id FROM pages;
INSERT INTO items (item_type, item_type_id) SELECT "templates", id FROM templates;
INSERT INTO items (item_type, item_type_id) SELECT "smtp", id FROM smtp;
INSERT INTO items (item_type, item_type_id) SELECT "groups", id FROM groups;

-- +goose Down
DROP TABLE IF EXISTS item_teams;
DROP TABLE IF EXISTS items;
