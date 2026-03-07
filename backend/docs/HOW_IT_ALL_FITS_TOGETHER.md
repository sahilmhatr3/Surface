# How It All Fits Together: Postgres, SQLAlchemy, Alembic, venv, FastAPI

This doc explains what each piece does, how they connect, why things didn’t “just work” earlier, and what the main commands (and `setup_db.sh`) actually do.

---

## 1. The big picture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  You (terminal / browser)                                                │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │  HTTP (e.g. GET /cycles)
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FastAPI (app/main.py)                                                  │
│  - Receives HTTP requests                                               │
│  - Calls route handlers in app/routes/*.py                              │
│  - Uses get_db() to get a database session for each request             │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │  Python calls (session.query(User), etc.)
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SQLAlchemy (app/db.py, app/models/)                                    │
│  - Engine: knows how to talk to Postgres (using DATABASE_URL)           │
│  - Session: one “conversation” with the DB per request                  │
│  - Models (User, Team, Rant, …): Python classes that map to tables      │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │  SQL over the network (localhost:5432)
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL (separate server process on your machine)                   │
│  - Listens on port 5432                                                 │
│  - Has users, databases, and (after migrations) tables                  │
│  - Stores the actual data                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

- **PostgreSQL** = the database server. It runs independently. It does **not** create the `surface` user or database or tables by itself; you (or a script) create those once.
- **SQLAlchemy** = the library your Python code uses to connect to Postgres, run queries, and map rows to Python objects (ORM). It does **not** create tables automatically; it expects them to already exist (or you create them via Alembic).
- **Alembic** = a migration tool that uses SQLAlchemy and your models to **create and change** tables (schema) in the database. It runs as separate commands (`alembic upgrade head`), not inside every app startup.
- **venv / .venv** = an isolated Python environment for the backend project. All backend dependencies (FastAPI, SQLAlchemy, Alembic, etc.) are installed **inside** this environment. If you run `uvicorn` or `alembic` with the **system** Python (or another env), those packages aren’t there → “No module named 'fastapi'” or “No module named 'alembic'”.
- **FastAPI** = the web framework. It handles HTTP and calls your route code, which uses the DB session from `get_db()`.

So: **Postgres** holds the data; **SQLAlchemy** talks to Postgres from Python; **Alembic** creates/updates the schema in Postgres; **venv** holds the Python packages; **FastAPI** is the HTTP entrypoint that uses SQLAlchemy to read/write the database.

---

## 2. Why things weren’t working earlier

Roughly three separate issues:

### A. “No module named 'fastapi'” when running uvicorn

- **Cause:** You ran `uvicorn app.main:app --reload` with a Python that **doesn’t** have the project’s dependencies (e.g. system `python3` or a different venv).
- **Fix:** Use the **project’s** environment so that `uvicorn` and `fastapi` come from there:
  - Activate the venv: `source .venv/bin/activate`, then run `uvicorn ...`, or
  - Call the venv’s executable directly: `.venv/bin/uvicorn app.main:app --reload`.

### B. “surface” password not working for the database

- **Cause:** The **Postgres user** `surface` and the **database** `surface` don’t exist until you create them. Postgres doesn’t create them for you. So logging in as `surface` with password `surface` can’t work before that.
- **Fix:** As the Postgres superuser (`postgres`), create the user and database once (e.g. run `setup_db.sh` or the equivalent SQL). After that, the password `surface` works for the user `surface`.

### C. Tables missing or app errors when hitting the API

- **Cause:** The app and SQLAlchemy assume the **tables** (users, teams, feedback_cycles, rants, etc.) exist. Those are **not** created by the app at startup; they are created by **Alembic migrations**. If you never run `alembic upgrade head`, the database is empty (no tables or wrong schema).
- **Fix:** From the backend directory, with the project venv activated, run `alembic upgrade head` so all migrations are applied and the schema matches the code.

So: “things weren’t just working” because (1) the right Python env wasn’t used, (2) the DB user and database hadn’t been created, and (3) the schema hadn’t been created by running Alembic.

---

## 3. What each command does

### Creating the database and user (one time)

| What you run | What it does |
|--------------|--------------|
| `sudo -u postgres bash scripts/setup_db.sh` | Runs the setup script **as** the Postgres superuser so it can create the `surface` user and database. See section 5 for what the script does line by line. |
| `PGPASSWORD=surface psql -h localhost -U surface -d surface -c "SELECT 1"` | Connects to Postgres as user `surface`, database `surface`, and runs one query. Used to **verify** that the user and database exist and the password works. `-h localhost` forces TCP so Postgres uses password auth. |

### Running the app

| What you run | What it does |
|--------------|--------------|
| `source .venv/bin/activate` | Activates the project’s virtual environment. After this, `python`, `pip`, `uvicorn`, `alembic` are the ones from `.venv` (with FastAPI, SQLAlchemy, etc.). |
| `uvicorn app.main:app --reload` | Starts the FastAPI app. Loads `app.main:app` (the ASGI app), binds to a port (default 8000), and reloads on code changes. The app uses `DATABASE_URL` from config to create the SQLAlchemy engine and connect to Postgres. |
| `.venv/bin/uvicorn app.main:app --reload` | Same as above, but uses the venv’s `uvicorn` **without** activating the venv. Ensures the correct environment is used. |

### Creating and updating the schema (tables)

| What you run | What it does |
|--------------|--------------|
| `alembic current` | Connects to the DB using `DATABASE_URL`, reads the `alembic_version` table, and prints which migration revision is currently applied. No schema change. |
| `alembic upgrade head` | Applies every migration that hasn’t been applied yet, in order. Creates or alters tables so the DB schema matches the code. “head” = latest revision. Required before the app can use the database properly. |
| `alembic history` | Lists all migration files and their revision IDs (no DB connection, no changes). |

All of these must be run **from the backend directory** (`Surface/backend`) so that `app` and `alembic.ini` are found. Alembic and uvicorn must run with the **project venv** so they see `app.core.config.settings` and the installed packages.

---

## 4. How the app gets the database URL

- **Default:** `app/core/config.py` sets `DATABASE_URL = "postgresql://surface:surface@localhost:5432/surface"`.
- **Override:** If you create `backend/.env` and set `DATABASE_URL=...`, Pydantic loads that and the app and Alembic both use it (Alembic’s `env.py` does `from app.core.config import settings` and then `config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)`).
- **Same URL everywhere:** FastAPI routes use `get_db()` → `SessionLocal()` → SQLAlchemy engine built from `settings.DATABASE_URL`. Alembic uses the same `settings.DATABASE_URL`. So one URL controls both the running app and migrations.

---

## 5. What `backend/scripts/setup_db.sh` does

This script is meant to be run **once**, as the Postgres superuser, to create the user and database that the app and Alembic use. It does **not** create tables; that’s Alembic’s job.

- **`set -e`**  
  Exit the script immediately if any command fails.

- **`PSQL="${PSQL:-psql}"`**  
  Use the `psql` command (or whatever is in `PSQL` if set). When run as `postgres`, `psql` connects by default to Postgres without a password.

- **First block (user)**  
  - Runs a small PL/pgSQL block inside Postgres.  
  - If the role `surface` does **not** exist: `CREATE USER surface WITH PASSWORD 'surface';`  
  - If it **does** exist: `ALTER USER surface WITH PASSWORD 'surface';`  
  So the login name is `surface` and the password is set to `surface` (creating or resetting it).

- **Second block (database)**  
  - Checks if a database named `surface` exists (`SELECT 1 FROM pg_database WHERE datname = 'surface'`).  
  - If that query returns no row (`grep -q 1` fails): runs `CREATE DATABASE surface OWNER surface;`  
  So the database `surface` exists and is owned by the user `surface`.

- **Third block (privileges)**  
  - Connects to the database `surface` (`-d surface`) and runs `GRANT ALL ON SCHEMA public TO surface;`  
  So the user `surface` can create and use tables in the `public` schema (needed for Alembic to run migrations).

- **Final echo lines**  
  Remind you how to connect as `surface` and to run `alembic upgrade head` from the backend with the venv active.

**Summary:** `setup_db.sh` creates (or resets) the **Postgres user and database** and grants schema rights. It does **not** install Python packages, run the app, or create tables; those are venv, uvicorn, and Alembic respectively.

---

## 6. Order of operations (first-time setup)

1. **PostgreSQL** is installed and running (`sudo service postgresql start` if needed).
2. **Create user + database:** run `sudo -u postgres bash scripts/setup_db.sh` (or the equivalent SQL).
3. **Confirm login:** e.g. `PGPASSWORD=surface psql -h localhost -U surface -d surface -c "SELECT 1"`.
4. **Create/update schema:** from `Surface/backend` with `.venv` activated, run `alembic upgrade head`.
5. **Run the app:** from `Surface/backend` with `.venv` activated, run `uvicorn app.main:app --reload` (or use `.venv/bin/uvicorn`).

After that, the app can use the database and you can view live data with `psql -h localhost -U surface -d surface` (password `surface`).
