-- +goose Up
ALTER TABLE campaigns ADD COLUMN use_evilginx BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE campaigns DROP COLUMN use_evilginx;
