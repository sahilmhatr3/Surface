#!/usr/bin/env python3
"""
Full E2E test: admin setup → open cycle → feedback (rants + structured) → close → aggregate → verify themes, manager-summary, AI summary.
Run from backend/ with venv activated: python scripts/test_full_backend.py
Uses TestClient (no server needed). Requires DB. Set OPENAI_API_KEY in .env for rant + AI cycle summary.
"""
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
_run = uuid.uuid4().hex[:8]

# Cycle window: start in past, end in future so we can collect then close manually
_now = datetime.now(timezone.utc)
_start = (_now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
_end = (_now + timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    ai_available = False
    rants_submitted = 0

    print("=== 1. Auth & admin setup ===")
    r = client.post(
        "/auth/register",
        json={
            "email": f"e2e_admin_{_run}@x.com",
            "password": "adminpass123",
            "name": "Admin",
            "role": "admin",
        },
    )
    assert r.status_code == 200, r.text
    admin_token = r.json()["access_token"]
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    r = client.post(
        "/admin/users/import",
        headers=headers_admin,
        json={
            "users": [
                {"name": "D", "email": f"e2e_d_{_run}@x.com", "role": "employee", "team_name": f"E2ETeam_{_run}"},
            ]
        },
    )
    assert r.status_code == 200, r.text

    r = client.get("/admin/teams", headers=headers_admin)
    assert r.status_code == 200, r.text
    team_id = next(t["id"] for t in r.json() if t["name"] == f"E2ETeam_{_run}")
    print("   team_id:", team_id)

    # Manager + 2 employees so we have structured feedback (manager + peers)
    r = client.post(
        "/auth/register",
        json={
            "email": f"e2e_mgr_{_run}@x.com",
            "password": "mgr12345",
            "name": "Manager",
            "role": "manager",
            "team_id": team_id,
        },
    )
    assert r.status_code == 200, r.text
    mgr = r.json()["user"]
    mgr_id = mgr["id"]

    r = client.post(
        "/auth/register",
        json={
            "email": f"e2e_alice_{_run}@x.com",
            "password": "alice12345",
            "name": "Alice",
            "role": "employee",
            "team_id": team_id,
        },
    )
    assert r.status_code == 200, r.text
    alice = r.json()["user"]
    alice_id = alice["id"]

    r = client.post(
        "/auth/register",
        json={
            "email": f"e2e_carol_{_run}@x.com",
            "password": "carol12345",
            "name": "Carol",
            "role": "employee",
            "team_id": team_id,
        },
    )
    assert r.status_code == 200, r.text
    carol = r.json()["user"]
    carol_id = carol["id"]
    print("   manager id:", mgr_id, "alice:", alice_id, "carol:", carol_id)

    print("=== 2. Create open cycle ===")
    r = client.post(
        f"/admin/teams/{team_id}/cycles",
        headers=headers_admin,
        json={"start_date": _start, "end_date": _end},
    )
    assert r.status_code == 200, r.text
    cycle_id = r.json()["id"]
    assert r.json()["status"] == "open"
    print("   cycle_id:", cycle_id)

    print("=== 3. List cycles (as manager) ===")
    r = client.post("/auth/login", json={"email": f"e2e_mgr_{_run}@x.com", "password": "mgr12345"})
    assert r.status_code == 200, r.text
    mgr_token = r.json()["access_token"]
    hm = {"Authorization": f"Bearer {mgr_token}"}
    r = client.get("/cycles", headers=hm)
    assert r.status_code == 200, r.text
    cycles = r.json()
    assert len(cycles) >= 1 and any(c["id"] == cycle_id for c in cycles), "Cycle should appear in list"
    print("   cycles count:", len(cycles))

    print("=== 4. Feedback submission ===")
    # Alice: rant + structured for manager and Carol
    r = client.post("/auth/login", json={"email": f"e2e_alice_{_run}@x.com", "password": "alice12345"})
    assert r.status_code == 200, r.text
    ha = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.post(
        "/feedback/rant",
        headers=ha,
        json={"cycle_id": cycle_id, "text": "Too many meetings and context switching.", "tags": ["workload"]},
    )
    if r.status_code == 200:
        rants_submitted += 1
        ai_available = True
        print("   Alice rant OK, theme:", r.json().get("theme"), "sentiment:", r.json().get("sentiment"))
    elif r.status_code in (502, 503):
        print("   Alice rant SKIP (AI unavailable:", r.status_code, ")")
    else:
        assert False, f"rant unexpected: {r.status_code} {r.text}"

    r = client.post(
        "/feedback/structured",
        headers=ha,
        json={
            "cycle_id": cycle_id,
            "receiver_id": mgr_id,
            "scores": {"support": 4, "communication": 5},
            "comments_helpful": "Clear priorities.",
            "comments_improvement": "More async updates.",
        },
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/feedback/structured",
        headers=ha,
        json={
            "cycle_id": cycle_id,
            "receiver_id": carol_id,
            "scores": {"support": 5, "communication": 4},
            "comments_helpful": "Great collaborator.",
            "comments_improvement": None,
        },
    )
    assert r.status_code == 200, r.text

    # Manager: rant + structured for Alice and Carol
    r = client.post(
        "/feedback/rant",
        headers=hm,
        json={"cycle_id": cycle_id, "text": "Tools are slow; we need better CI.", "tags": ["tools"]},
    )
    if r.status_code == 200:
        rants_submitted += 1
        ai_available = True
        print("   Manager rant OK")
    elif r.status_code in (502, 503):
        print("   Manager rant SKIP (AI unavailable)")
    else:
        assert False, f"manager rant: {r.status_code} {r.text}"

    r = client.post(
        "/feedback/structured",
        headers=hm,
        json={
            "cycle_id": cycle_id,
            "receiver_id": alice_id,
            "scores": {"support": 4, "communication": 4},
            "comments_helpful": "On time delivery.",
            "comments_improvement": "Document decisions.",
        },
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/feedback/structured",
        headers=hm,
        json={
            "cycle_id": cycle_id,
            "receiver_id": carol_id,
            "scores": {"support": 5, "communication": 5},
            "comments_helpful": "Always helpful.",
            "comments_improvement": None,
        },
    )
    assert r.status_code == 200, r.text

    # Carol: rant + structured for manager and Alice
    r = client.post("/auth/login", json={"email": f"e2e_carol_{_run}@x.com", "password": "carol12345"})
    assert r.status_code == 200, r.text
    hc = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.post(
        "/feedback/rant",
        headers=hc,
        json={"cycle_id": cycle_id, "text": "Communication has improved this sprint.", "tags": ["communication"]},
    )
    if r.status_code == 200:
        rants_submitted += 1
        ai_available = True
        print("   Carol rant OK")
    elif r.status_code in (502, 503):
        print("   Carol rant SKIP (AI unavailable)")
    else:
        assert False, f"carol rant: {r.status_code} {r.text}"

    r = client.post(
        "/feedback/structured",
        headers=hc,
        json={
            "cycle_id": cycle_id,
            "receiver_id": mgr_id,
            "scores": {"support": 5, "communication": 4},
            "comments_helpful": "Supportive.",
            "comments_improvement": "Earlier feedback on PRs.",
        },
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/feedback/structured",
        headers=hc,
        json={
            "cycle_id": cycle_id,
            "receiver_id": alice_id,
            "scores": {"support": 4, "communication": 5},
            "comments_helpful": None,
            "comments_improvement": "Share context earlier.",
        },
    )
    assert r.status_code == 200, r.text
    print("   Structured feedback: 6 rows (Alice→Bob, Alice→Carol, Bob→Alice, Bob→Carol, Carol→Bob, Carol→Alice)")

    print("=== 5. Close cycle (admin) ===")
    r = client.patch(
        f"/admin/teams/{team_id}/cycles/{cycle_id}",
        headers=headers_admin,
        json={"status": "closed"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "closed"
    print("   status:", r.json()["status"])

    print("=== 6. Aggregate (manager) ===")
    r = client.post(f"/cycles/{cycle_id}/aggregate", headers=hm)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "aggregated"
    assert data.get("participation_rants") is not None
    assert data.get("participation_structured") is not None
    print("   status:", data["status"], "participation_rants:", data["participation_rants"], "participation_structured:", data["participation_structured"])

    print("=== 7. Verify themes ===")
    r = client.get(f"/cycles/{cycle_id}/themes", headers=hm)
    assert r.status_code == 200, r.text
    themes_data = r.json()
    assert themes_data["cycle_id"] == cycle_id
    assert themes_data["participation_rants"] == data["participation_rants"]
    assert themes_data["participation_structured"] == data["participation_structured"]
    if rants_submitted > 0:
        assert len(themes_data["themes"]) >= 1, "Should have at least one theme from rants"
        print("   themes count:", len(themes_data["themes"]), [t["theme"] for t in themes_data["themes"]])
    else:
        print("   themes (no rants):", len(themes_data["themes"]))

    print("=== 8. Verify manager-summary ===")
    r = client.get(f"/cycles/{cycle_id}/manager-summary", headers=hm)
    assert r.status_code == 200, r.text
    ms = r.json()
    assert ms["cycle_id"] == cycle_id
    assert "average_scores" in ms and "comment_snippets_helpful" in ms or "below_threshold_note" in ms
    print("   average_scores:", ms.get("average_scores"), "snippets/note:", "snippets" if ms.get("comment_snippets_helpful") or ms.get("comment_snippets_improvement") else ms.get("below_threshold_note"))

    print("=== 9. Verify summary (AI summary_text) ===")
    r = client.get(f"/cycles/{cycle_id}/summary", headers=hm)
    assert r.status_code == 200, r.text
    summary_data = r.json()
    assert summary_data["cycle_id"] == cycle_id
    assert "themes" in summary_data and "actions" in summary_data
    summary_text = summary_data.get("summary_text")
    if ai_available and (rants_submitted > 0 or True):  # we always have structured snippets
        assert summary_text, "AI summary should be present when OpenAI was used for aggregation"
        print("   summary_text length:", len(summary_text), "chars")
    else:
        print("   summary_text:", "present" if summary_text else "null (no OpenAI key or no content)")

    print("=== 10. Manager adds action; employee sees summary ===")
    r = client.post(
        f"/cycles/{cycle_id}/actions",
        headers=hm,
        json={"theme": themes_data["themes"][0]["theme"] if themes_data["themes"] else "general", "action_text": "We will reduce meeting load and improve tooling."},
    )
    assert r.status_code == 200, r.text
    r = client.get(f"/cycles/{cycle_id}/summary", headers=hc)
    assert r.status_code == 200, r.text
    assert len(r.json()["actions"]) >= 1
    print("   employee summary: 1+ action, themes + summary_text present")

    print("=== 11. List cycles after aggregate ===")
    r = client.get("/cycles", headers=hm)
    assert r.status_code == 200, r.text
    our = next(c for c in r.json() if c["id"] == cycle_id)
    assert our["status"] == "aggregated"
    assert our.get("participation_rants") == data["participation_rants"]
    assert our.get("participation_structured") == data["participation_structured"]
    print("   list shows status=aggregated and participation counts")

    print("=== 12. Admin list team cycles ===")
    r = client.get(f"/admin/teams/{team_id}/cycles", headers=headers_admin)
    assert r.status_code == 200, r.text
    assert any(c["id"] == cycle_id and c["status"] == "aggregated" for c in r.json())
    print("   admin sees aggregated cycle")

    print("\n=== All full-backend checks passed. ===")
    if not ai_available:
        print("(Run with OPENAI_API_KEY in .env to exercise rant theme/sentiment and AI cycle summary.)")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
