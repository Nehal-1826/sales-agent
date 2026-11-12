-- Create the `agent` database (Django / sales-agent schema) next to the
-- WarmPulse database in the shared Postgres cluster.
--
-- Mounted at /docker-entrypoint-initdb.d/ by docker-compose.yml; the official
-- postgres image runs it once, on first cluster init only (existing volumes
-- are untouched — for those, run this by hand:
--   docker exec -it warmpulse-postgres psql -U warmpulse -f - < ops/db/init-agent-db.sql
-- ).
--
-- Idempotent guard: CREATE DATABASE cannot run inside a transaction and has no
-- IF NOT EXISTS, so the \gexec psql meta-command only executes the statement
-- when the database is missing.
SELECT 'CREATE DATABASE agent'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'agent')\gexec
