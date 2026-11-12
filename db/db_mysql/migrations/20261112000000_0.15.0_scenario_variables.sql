-- +goose Up
ALTER TABLE scenarios ADD COLUMN variables TEXT NULL;
-- +goose Down
ALTER TABLE scenarios DROP COLUMN variables;
