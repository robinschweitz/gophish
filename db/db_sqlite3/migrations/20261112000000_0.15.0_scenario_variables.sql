-- +goose Up
ALTER TABLE scenarios ADD COLUMN variables TEXT NOT NULL DEFAULT '{}';
-- +goose Down
ALTER TABLE scenarios DROP COLUMN variables;
