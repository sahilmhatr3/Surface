# Self reference notes: ()
backend:
source .venv/bin/activate
uvicorn app.main:app --reload
psql -h localhost -p 5432 -U surface -d surface
alembic upgrade head
http://127.0.0.1:8000/docs#/

frontend:
npm install
npm run dev

# Surface – PostgreSQL & Alembic Setup

This guide explains how PostgreSQL fits into your project, how to install/start it, and how to run Alembic to create your database tables.

---

## Do I need to run Alembic? **Yes.**

The app does **not** create tables automatically. All tables (`users`, `teams`, `feedback_cycles`, `rants`, etc.) are created only when you run Alembic migrations. Until you run `alembic upgrade head`, the database is empty (or missing tables) and the API will fail on use.

**Order of operations:** (1) PostgreSQL running → (2) Create user + database (once) → (3) Run `alembic upgrade head` (once, then again when new migrations are added).

---

## 1. How PostgreSQL Fits In

- **PostgreSQL** is a separate program (a “database server”) that runs on your machine. It is **not** inside your Surface project folder.
- Your **Surface backend** is configured to **connect** to PostgreSQL at:
  - **Host:** `localhost` (this computer)
  - **Port:** `5432` (default Postgres port)
  - **Database name:** `surface`
  - **User:** `surface`
  - **Password:** `surface`

That connection string is in `backend/app/core/config.py` (and can be overridden with a `.env` file).

So: you install and start PostgreSQL **on your system**. Your app and Alembic then **connect** to it. Nothing “installs” PostgreSQL into the project directory; the project only holds the **configuration** (URL, user, database name).

---

## 2. Install PostgreSQL (If You Don’t Have It)

You may not have installed it yet. On **Linux / WSL2**:

```bash
# Ubuntu/Debian/WSL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start the server (often already started after install)
sudo service postgresql start
```

**What this does:** Installs the PostgreSQL server and client tools. The server runs in the background and listens on port 5432. Your app and Alembic will talk to it over the network (localhost).

---

## 3. Check If PostgreSQL Is Running

```bash
# See if the postgres service is active
sudo service postgresql status

# Or try connecting with the default superuser (no password by default)
sudo -u postgres psql -c "SELECT 1"
```

- **status** – Tells you if the server is running.
- **psql** – Command-line client that connects to the database. If `SELECT 1` returns a row, Postgres is up and accepting connections.

---

## 4. Create the Database and User Your App Expects

Your config expects a **database** named `surface` and a **user** `surface` with password `surface`. Create them once **as the Postgres superuser** (the `surface` user does not exist until you create it; that’s why “surface” as password doesn’t work when nothing has been created yet):

```bash
# Connect as the default superuser (no password; uses system auth)
sudo -u postgres psql

# Then in the psql prompt, run:

CREATE USER surface WITH PASSWORD 'surface';
CREATE DATABASE surface OWNER surface;
GRANT ALL PRIVILEGES ON DATABASE surface TO surface;

-- Required so Alembic can create tables
\c surface
GRANT ALL ON SCHEMA public TO surface;

\q
```

**What this does:**

- **CREATE USER** – Creates the login your app uses (`surface` / `surface`). If you get “already exists”, the user was created before; to **reset the password** use: `ALTER USER surface WITH PASSWORD 'surface';`
- **CREATE DATABASE** – Creates the database named `surface`. If it already exists, skip that line.
- **OWNER / GRANT** – Gives the `surface` user permission to create tables and use that database. Alembic will run as this user and create tables here.

**If “surface” as password still doesn’t work when connecting:**

- Make sure you’re connecting with `-h localhost` (e.g. `psql -h localhost -U surface -d surface`). On some setups, connection without `-h` uses peer auth and ignores the password.
- Try: `PGPASSWORD=surface psql -h localhost -U surface -d surface -c "SELECT 1"` to avoid typing the password.
- Ensure the user exists and the password is set: as `postgres`, run `ALTER USER surface WITH PASSWORD 'surface';`

---

## 5. Verify the Connection From Your Machine

From a normal terminal (not necessarily inside the project):

```bash
# Connect using the same credentials your app uses
psql -h localhost -p 5432 -U surface -d surface
# Password: surface
```

If you get a `surface=>` prompt, the database and user are set up correctly. Type `\q` to quit.

---

## 6. Where to Run Alembic (Directory and Environment)

Alembic must run **from the backend directory** and use the **same Python environment** that has your app and Alembic installed (e.g. your `venv`).

```bash
cd /path/to/Surface/backend

# Use the project virtual environment (.venv or venv)
source .venv/bin/activate   # or: source venv/bin/activate

# Now Alembic and your app’s config are available
alembic current
alembic upgrade head
```

**Why this directory?**

- `alembic.ini` lives in `backend/`. Alembic looks for it in the **current working directory**.
- Your app is under `backend/app/`. When `alembic/env.py` runs, it does `from app.core.config import settings` and `from app.models import ...`. That only works when the **current directory** is `backend` (so `app` is on the Python path).

**Why activate venv?**

- So the `alembic` and `sqlalchemy` (and other) packages used in migrations are the ones from your project, not the system Python.

---

## 7. What “Boot Up” the Database Means (Alembic Commands)

Your **tables** (users, teams, rants, etc.) don’t exist until you run migrations. “Booting up” the database for your app means:

1. **PostgreSQL is running** (steps 2–3).
2. **Database and user exist** (step 4).
3. **Migrations are applied** so the `surface` database has all the tables.

Run:

```bash
cd /path/to/Surface/backend
source .venv/bin/activate   # or venv/bin/activate
alembic upgrade head
```

**What happens when you run that:**

1. Alembic reads `alembic.ini` and `alembic/env.py`.
2. `env.py` loads your app’s config (e.g. `DATABASE_URL` from `config.py` or `.env`) and connects to PostgreSQL as `surface` on the `surface` database.
3. Alembic looks at the `alembic_version` table (creates it if needed) to see which migrations are already applied.
4. It runs every migration that hasn’t been applied yet (e.g. `51b8154783ef_initial_migration.py`). That script runs the `upgrade()` function, which executes the SQL to create `teams`, `users`, `feedback_cycles`, `rants`, `structured_feedback`, `cycle_insights`, `actions`.
5. It records the new version in `alembic_version` so next time it won’t re-run the same migration.

After this, your database is “booted” for the app: all tables exist and Alembic is in sync.

---

## 8. Useful Commands (All From `backend/` With venv Active)

```bash
cd /path/to/Surface/backend
source .venv/bin/activate

# What’s the current migration version? (which migrations are applied)
alembic current

# Apply all pending migrations (create/update tables)
alembic upgrade head

# Show migration history
alembic history

# Undo the last migration (drops tables from that migration)
alembic downgrade -1
```

---

## 9. Quick Reference: “First Time” vs “Check State”

**First-time setup (install, create DB, create tables):**

1. Install and start PostgreSQL (section 2–3).
2. Create user and database (section 4).
3. From `backend/` with venv: `alembic upgrade head` (section 7).

**Later: just check state and use the DB:**

- **PostgreSQL:** `sudo service postgresql status` (section 3).
- **Database contents:** `psql -h localhost -p 5432 -U surface -d surface` then `\dt` to list tables (section 5).
- **Alembic state:** from `backend/` with venv: `alembic current` (section 8).

That’s how you start and check the current state of your Postgres database and how/where to run Alembic to “boot up” your tables.
