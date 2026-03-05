#!/bin/bash
# Quick check: health, auth, admin routes. Run from backend/ with venv activated.
# Usage: ./scripts/check_admin_routes.sh [BASE_URL]
set -e
BASE="${1:-http://127.0.0.1:8000}"
echo "Using BASE=$BASE"
echo "1. Health"
curl -s "$BASE/health" | head -c 80
echo ""
echo "2. Register admin + get token"
REG=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d '{"email":"checkadmin@test.com","password":"adminpass123","name":"Admin","role":"admin"}')
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
test -n "$TOKEN" && echo "Token OK" || (echo "No token"; exit 1)
echo "3. GET /admin/teams (with auth)"
curl -s "$BASE/admin/teams" -H "Authorization: Bearer $TOKEN" | head -c 200
echo ""
echo "4. POST /admin/users/import"
IMP=$(curl -s -X POST "$BASE/admin/users/import" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"users":[{"name":"A","email":"checka@t.com","role":"employee","team_name":"Check"},{"name":"B","email":"checkb@t.com","role":"manager","team_name":"Check"}]}')
echo "$IMP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('teams_created:', d.get('teams_created'), 'users_created:', d.get('users_created'))"
echo "5. POST /admin/teams/1/cycles"
CYC=$(curl -s -X POST "$BASE/admin/teams/1/cycles" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"start_date":"2025-05-01T00:00:00Z","end_date":"2025-05-15T00:00:00Z"}')
echo "$CYC" | python3 -c "import sys,json; d=json.load(sys.stdin); print('cycle id:', d.get('id'), 'status:', d.get('status'))"
echo "Done."
