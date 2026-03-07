#!/usr/bin/env bash
# Run the Surface API using the project venv (avoids ModuleNotFoundError when system Python is used).
cd "$(dirname "$0")"
exec .venv/bin/uvicorn app.main:app --reload
