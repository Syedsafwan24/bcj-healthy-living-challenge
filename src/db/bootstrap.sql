-- Objects the generated migrations depend on but do not create themselves.
-- Run before the drizzle migrations. Safe to run repeatedly.

-- citext backs the case-insensitive email columns on admins and participants.
CREATE EXTENSION IF NOT EXISTS citext;

-- gen_random_uuid() is built in from PostgreSQL 13; pgcrypto is kept for
-- deployments still on an older server.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The readable ordinal inside the registration ID, 'BCJ0001-7K2M'.
-- Section 7: seq_no keeps the sequential part useful for support and sorting.
CREATE SEQUENCE IF NOT EXISTS participant_seq START 1;
