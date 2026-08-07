"""Run a full interview from the terminal against a running ProbeAI server.

    uvicorn main:app --reload --app-dir backend      # in one shell
    python scripts/interview_cli.py CAND-001         # in another
"""

import json
import sys
import uuid
from pathlib import Path

import httpx

BASE_URL = "http://127.0.0.1:8000"
CANDIDATES = Path(__file__).resolve().parents[1] / "backend" / "data" / "candidates.json"

candidate_id = (sys.argv[1] if len(sys.argv) > 1 else "CAND-001").upper()
candidates = json.loads(CANDIDATES.read_text(encoding="utf-8"))
candidate = next((c for c in candidates if c["member"]["id"] == candidate_id), None)
if candidate is None:
    raise SystemExit(f"Unknown candidate '{candidate_id}'.")

session_id = str(uuid.uuid4())
print(f"Session {session_id} | {candidate['member']['name']} — {candidate['member']['jobRole']}\n")

with httpx.Client(timeout=120.0) as client:
    response = client.post(
        f"{BASE_URL}/api/interview",
        json={"sessionId": session_id, "candidate": candidate},
    )
    response.raise_for_status()
    data = response.json()

    while True:
        print(f"\nINTERVIEWER: {data['reply']}\n")

        if data.get("done"):
            print("=" * 70)
            print("FEEDBACK")
            print("=" * 70)
            print(json.dumps(data.get("feedback"), indent=2))
            break

        answer = input("YOU> ").strip()
        if answer.lower() in {"quit", "exit"}:
            break

        response = client.post(
            f"{BASE_URL}/api/interview",
            json={"sessionId": session_id, "message": answer},
        )
        response.raise_for_status()
        data = response.json()
