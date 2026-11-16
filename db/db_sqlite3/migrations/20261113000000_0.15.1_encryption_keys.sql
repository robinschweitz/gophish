-- +goose Up
ALTER TABLE campaigns ADD COLUMN encryption_key varchar(255);
ALTER TABLE email_requests ADD COLUMN encryption_key varchar(255);

-- +goose Down
ALTER TABLE email_requests DROP COLUMN encryption_key;
ALTER TABLE campaigns DROP COLUMN encryption_key;
