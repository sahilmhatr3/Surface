#!/usr/bin/env bash
# One-time: create PostgreSQL user and database for Surface.
# Run with: sudo -u postgres bash scripts/setup_db.sh
# (Or run the psql commands manually as postgres.)

set -e
PSQL="${PSQL:-psql}"

echo "Creating user 'surface' with password 'surface' (if not exists)..."
$PSQL -v ON_ERROR_STOP=1 -c "DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'surface') THEN
    CREATE USER surface WITH PASSWORD 'surface';
  ELSE
    ALTER USER surface WITH PASSWORD 'surface';
  END IF;
END \$\$;"

echo "Creating database 'surface' (if not exists)..."
$PSQL -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = 'surface'" | grep -q 1 || $PSQL -v ON_ERROR_STOP=1 -c "CREATE DATABASE surface OWNER surface;"

echo "Granting privileges..."
$PSQL -v ON_ERROR_STOP=1 -d surface -c "GRANT ALL ON SCHEMA public TO surface;"

echo "Done. Connect with: PGPASSWORD=surface psql -h localhost -U surface -d surface"
echo "Then from backend dir with .venv active run: alembic upgrade head"
