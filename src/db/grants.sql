-- Specification section 7: audit_log is append-only. Grant the application
-- role INSERT and SELECT on it, never UPDATE or DELETE.
--
-- Run this as the database owner, once, against the role the application
-- connects as. Replace :app_role before running, for example:
--
--   psql "$DATABASE_URL" -v app_role=bcj_app -f src/db/grants.sql

\if :{?app_role}
\else
  \set app_role 'bcj_app'
\endif

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM :"app_role";
GRANT INSERT, SELECT ON audit_log TO :"app_role";
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO :"app_role";

-- Everything else keeps ordinary read and write access.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  settings, admins, diet_categories, participants, participant_health,
  sessions, daily_entries, weekly_scores, final_scores, rate_limits
TO :"app_role";

-- UPDATE as well as USAGE: the end-of-season reset calls setval() to put
-- registration numbering back to 1, and setval needs UPDATE on the sequence.
-- USAGE alone covers only nextval and currval.
GRANT USAGE, SELECT, UPDATE ON SEQUENCE participant_seq TO :"app_role";
GRANT USAGE, SELECT ON SEQUENCE diet_categories_id_seq TO :"app_role";
