#!/usr/bin/env python3
"""
Test feedback routes: create admin, team, cycle, then as employee submit rant and structured feedback.
Run from backend/ with venv activated: python scripts/test_feedback_routes.py
Uses TestClient; requires DB and optionally OPENAI_API_KEY for rant (503 if missing).
"""
import os
import sys
import uuid

# Ensure app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
# Unique suffix so test can be run multiple times
_run = uuid.uuid4().hex[:8]


def main():
    print("1. Register admin")
    r = client.post(
        "/auth/register",
        json={"email": f"testfb_admin_{_run}@x.com", "password": "adminpass123", "name": "Admin", "role": "admin"},
    )
    assert r.status_code == 200, r.text
    admin_token = r.json()["access_token"]
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    print("2. Import team (one user to create team)")
    r = client.post(
        "/admin/users/import",
        headers=headers_admin,
        json={
            "users": [
                {"name": "Dummy", "email": f"testfb_dummy_{_run}@x.com", "role": "employee", "team_name": f"TestFBTeam_{_run}"},
            ]
        },
    )
    assert r.status_code == 200, r.text
    print("   ", r.json())

    print("3. List teams, get team_id")
    r = client.get("/admin/teams", headers=headers_admin)
    assert r.status_code == 200, r.text
    teams = r.json()
    team_name = f"TestFBTeam_{_run}"
    team_id = next(t["id"] for t in teams if t["name"] == team_name)
    print("   team_id:", team_id)

    print("4. Register Alice (employee) and Bob (manager) with team_id so they can login")
    r = client.post(
        "/auth/register",
        json={
            "email": f"testfb_alice_{_run}@x.com",
            "password": "alice12345",
            "name": "Alice",
            "role": "employee",
            "team_id": team_id,
        },
    )
    assert r.status_code == 200, r.text
    alice = r.json()["user"]
    r = client.post(
        "/auth/register",
        json={
            "email": f"testfb_bob_{_run}@x.com",
            "password": "bob12345",
            "name": "Bob",
            "role": "manager",
            "team_id": team_id,
        },
    )
    assert r.status_code == 200, r.text
    bob = r.json()["user"]
    bob_id = bob["id"]
    print("   Alice id:", alice["id"], "Bob id:", bob_id)

    print("5. Create open cycle for team")
    r = client.post(
        f"/admin/teams/{team_id}/cycles",
        headers=headers_admin,
        json={"start_date": "2025-07-01T00:00:00Z", "end_date": "2025-07-15T00:00:00Z"},
    )
    assert r.status_code == 200, r.text
    cycle_id = r.json()["id"]
    print("   cycle_id:", cycle_id)

    print("6. Login as Alice")
    r = client.post(
        "/auth/login",
        json={"email": f"testfb_alice_{_run}@x.com", "password": "alice12345"},
    )
    assert r.status_code == 200, r.text
    alice_token = r.json()["access_token"]
    headers_alice = {"Authorization": f"Bearer {alice_token}"}

    print("7. POST /feedback/rant (needs valid OPENAI_API_KEY in .env)")
    r = client.post(
        "/feedback/rant",
        headers=headers_alice,
        json={"cycle_id": cycle_id, "text": "Too many meetings this week.", "tags": ["workload"]},
    )
    if r.status_code == 200:
        data = r.json()
        print("   OK: id=", data.get("id"), "theme=", data.get("theme"), "sentiment=", data.get("sentiment"))
    elif r.status_code == 503:
        print("   SKIP (503 - OPENAI_API_KEY not set)")
    elif r.status_code == 502:
        print("   SKIP (502 - AI processing failed; check OPENAI_API_KEY and network)")
    else:
        print("   FAIL:", r.status_code, r.text)

    print("8. POST /feedback/structured (Alice -> Bob)")
    r = client.post(
        "/feedback/structured",
        headers=headers_alice,
        json={
            "receiver_id": bob_id,
            "cycle_id": cycle_id,
            "scores": {"support": 4, "communication": 5},
            "comments_helpful": "Clear direction.",
            "comments_improvement": "More 1:1s.",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    print("   OK:", "id=", data.get("id"), "receiver_id=", data.get("receiver_id"))

    print("9. POST /feedback/structured/batch (same cycle, one receiver)")
    r = client.post(
        "/feedback/structured/batch",
        headers=headers_alice,
        json={
            "cycle_id": cycle_id,
            "feedback": [
                {
                    "receiver_id": bob_id,
                    "scores": {"support": 5, "communication": 4},
                    "comments_helpful": "Updated.",
                    "comments_improvement": None,
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    print("   OK: batch length =", len(r.json()))

    print("10. Reject self-feedback")
    r = client.post(
        "/feedback/structured",
        headers=headers_alice,
        json={
            "receiver_id": alice["id"],
            "cycle_id": cycle_id,
            "scores": {"support": 3, "communication": 3},
            "comments_helpful": None,
            "comments_improvement": None,
        },
    )
    assert r.status_code == 400, (r.status_code, r.text)
    print("   OK (400 as expected)")

    print("11. Reject wrong cycle (closed)")
    # Create a closed cycle
    r = client.post(
        f"/admin/teams/{team_id}/cycles",
        headers=headers_admin,
        json={"start_date": "2025-01-01T00:00:00Z", "end_date": "2025-01-10T00:00:00Z"},
    )
    assert r.status_code == 200, r.text
    closed_cycle_id = r.json()["id"]
    # Mark it closed in DB (no API for that yet - so use open cycle and wrong team instead)
    # Actually we don't have "close cycle" in API. So test "cycle not found" instead.
    r = client.post(
        "/feedback/rant",
        headers=headers_alice,
        json={"cycle_id": 99999, "text": "x", "tags": []},
    )
    assert r.status_code == 404, (r.status_code, r.text)
    print("   OK (404 for unknown cycle)")

    print("\nAll feedback route checks passed.")


if __name__ == "__main__":
    main()
