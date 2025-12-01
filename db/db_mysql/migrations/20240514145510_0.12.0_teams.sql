-- +goose Up
CREATE TABLE IF NOT EXISTS teams (
    `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` VARCHAR(255) NOT NULL
);

-- +goose Down
DROP TABLE teams;
