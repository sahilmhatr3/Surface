#!/usr/bin/env python3
"""
Quick test for cycle routes: summary, themes, manager-summary, actions (POST/PATCH).
Run from backend/ with venv activated: python scripts/test_cycle_routes.py
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
_run = uuid.uuid4().hex[:8]


def main():
    print("Setup: admin, team, manager, employee, cycle")
    r = client.post("/auth/register", json={"email": f"cyc_admin_{_run}@x.com", "password": "admin123", "name": "Admin", "role": "admin"})
    assert r.status_code == 200, r.text
    admin_token = r.json()["access_token"]
    r = client.post("/admin/users/import", headers={"Authorization": f"Bearer {admin_token}"}, json={"users": [{"name": "D", "email": f"cyc_d_{_run}@x.com", "role": "employee", "team_name": f"CycTeam_{_run}"}]})
    assert r.status_code == 200, r.text
    r = client.get("/admin/teams", headers={"Authorization": f"Bearer {admin_token}"})
    team_id = next(t["id"] for t in r.json() if t["name"] == f"CycTeam_{_run}")
    r = client.post("/auth/register", json={"email": f"cyc_mgr_{_run}@x.com", "password": "mgr12345", "name": "Manager", "role": "manager", "team_id": team_id})
    assert r.status_code == 200, r.text
    mgr = r.json()["user"]
    r = client.post("/auth/register", json={"email": f"cyc_emp_{_run}@x.com", "password": "emp12345", "name": "Employee", "role": "employee", "team_id": team_id})
    assert r.status_code == 200, r.text
    r = client.post(f"/admin/teams/{team_id}/cycles", headers={"Authorization": f"Bearer {admin_token}"}, json={"start_date": "2025-08-01T00:00:00Z", "end_date": "2025-08-15T00:00:00Z"})
    assert r.status_code == 200, r.text
    cycle_id = r.json()["id"]
    r = client.post("/auth/login", json={"email": f"cyc_mgr_{_run}@x.com", "password": "mgr12345"})
    mgr_token = r.json()["access_token"]
    r = client.post("/auth/login", json={"email": f"cyc_emp_{_run}@x.com", "password": "emp12345"})
    emp_token = r.json()["access_token"]
    hm = {"Authorization": f"Bearer {mgr_token}"}
    he = {"Authorization": f"Bearer {emp_token}"}

    print("GET /cycles/{id}/summary as manager -> 200")
    r = client.get(f"/cycles/{cycle_id}/summary", headers=hm)
    assert r.status_code == 200, r.text
    assert r.json()["cycle_id"] == cycle_id and "themes" in r.json() and "actions" in r.json()

    print("GET /cycles/{id}/themes as manager -> 200 (empty themes before aggregate)")
    r = client.get(f"/cycles/{cycle_id}/themes", headers=hm)
    assert r.status_code == 200, r.text
    assert r.json()["themes"] == []

    print("POST /cycles/{id}/actions as manager -> 200")
    r = client.post(f"/cycles/{cycle_id}/actions", headers=hm, json={"theme": "workload", "action_text": "We will reduce meetings."})
    assert r.status_code == 200, r.text
    action_id = r.json()["id"]

    print("GET /cycles/{id}/summary again -> 200, one action")
    r = client.get(f"/cycles/{cycle_id}/summary", headers=hm)
    assert r.status_code == 200 and len(r.json()["actions"]) == 1, r.text

    print("PATCH /cycles/{id}/actions/{action_id} as manager -> 200")
    r = client.patch(f"/cycles/{cycle_id}/actions/{action_id}", headers=hm, json={"action_text": "Updated: we will reduce meetings and async updates."})
    assert r.status_code == 200, r.text
    assert "Updated" in r.json()["action_text"]

    print("GET /cycles/{id}/manager-summary as manager -> 200 or 400 (not aggregated)")
    r = client.get(f"/cycles/{cycle_id}/manager-summary", headers=hm)
    assert r.status_code in (200, 400), r.text

    print("Employee: GET summary -> 200; POST action -> 403")
    r = client.get(f"/cycles/{cycle_id}/summary", headers=he)
    assert r.status_code == 200, r.text
    r = client.post(f"/cycles/{cycle_id}/actions", headers=he, json={"theme": "x", "action_text": "y"})
    assert r.status_code == 403, r.text

    print("All cycle route checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
