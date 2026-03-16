#!/usr/bin/env python3
"""
Fetch MAE market data and write/update public/data/mae-snapshot.json.

Designed to run from GitHub Actions, where MAE's Incapsula WAF does NOT block
GitHub/Microsoft IP ranges (unlike Vercel/AWS Lambda which are blocked).

Data flow:
  1. Load existing snapshot  (to preserve repo history)
  2. Fetch today's /repo     (all plazos for today's date)
  3. Upsert today into repoHistory, trim to MAX_HISTORY_DAYS
  4. Fetch /cauciones, /rentafija, /forex   (today's market snapshots)
  5. Write new snapshot to public/data/mae-snapshot.json

The snapshot is then served by Next.js via
  /api/mae/mercado  →  reads raw.githubusercontent.com/…/mae-snapshot.json
"""

import json
import os
import sys
import datetime
import requests
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL         = "https://api.mae.com.ar/MarketData/v1"
SNAPSHOT_PATH    = Path("public/data/mae-snapshot.json")
MAX_HISTORY_DAYS = 90
REQUEST_TIMEOUT  = 30   # seconds per request


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_api_key() -> str:
    key = os.environ.get("MAE_API_KEY", "").strip()
    if not key:
        print("ERROR: MAE_API_KEY environment variable is not set", file=sys.stderr)
        sys.exit(1)
    return key


def mae_get(path: str, params: dict, key: str) -> object:
    """GET a MAE endpoint, raise on non-200."""
    url = f"{BASE_URL}{path}"
    resp = requests.get(
        url,
        params=params,
        headers={"x-api-key": key, "Accept": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def today_iso() -> str:
    return datetime.date.today().isoformat()


def utcnow_iso() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


# ── Snapshot persistence ──────────────────────────────────────────────────────

def load_snapshot() -> dict:
    """Load existing snapshot or return a blank skeleton."""
    if SNAPSHOT_PATH.exists():
        try:
            with open(SNAPSHOT_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            print(f"Warning: could not parse existing snapshot ({exc}), starting fresh",
                  file=sys.stderr)
    return {
        "fetchedAt":   None,
        "repoHistory": [],
        "cauciones":   [],
        "rentafija":   [],
        "forex":       [],
        "latestCurve": [],
    }


def save_snapshot(snap: dict) -> None:
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        # Compact JSON — keeps file small (~30 KB when full)
        json.dump(snap, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = SNAPSHOT_PATH.stat().st_size / 1024
    print(f"Snapshot saved → {SNAPSHOT_PATH}  ({size_kb:.1f} KB)")


# ── MAE fetchers ──────────────────────────────────────────────────────────────

def fetch_today_repos(key: str, today: str) -> dict[str, dict]:
    """
    Fetch /repo for today only.  Returns a dict keyed by normalized plazo ("001", "003" …).
    Returns {} on failure (market closed, WAF hiccup, etc.).
    """
    try:
        records = mae_get(
            "/mercado/cotizaciones/repo",
            {"fechaDesde": today, "fechaHasta": today, "pageNumber": 1},
            key,
        )
    except Exception as exc:
        print(f"  repo fetch failed: {exc}", file=sys.stderr)
        return {}

    if not isinstance(records, list) or len(records) == 0:
        return {}

    plazos: dict[str, dict] = {}
    for r in records:
        # MAE may send "1" or "001" — normalize to 3-char zero-padded string
        plazo = str(r.get("plazo", "")).strip().zfill(3)
        if not plazo or plazo == "000":
            continue
        plazos[plazo] = {
            "tasa": round(float(r.get("tasaPP", 0)), 4),
            "vol":  float(r.get("volumen",       0)),
            "ops":  int(  r.get("cantOperaciones", 0)),
        }
    return plazos


def fetch_endpoint(endpoint: str, key: str) -> list:
    """Fetch a snapshot endpoint (/cauciones, /rentafija, /forex). Returns [] on error."""
    try:
        data = mae_get(f"/mercado/cotizaciones/{endpoint}", {"pageNumber": 1}, key)
        return data if isinstance(data, list) else []
    except Exception as exc:
        print(f"  {endpoint} fetch failed: {exc}", file=sys.stderr)
        return []


# ── Build latestCurve ─────────────────────────────────────────────────────────

def build_latest_curve(plazos: dict[str, dict]) -> list[dict]:
    """Convert today's plazos dict to the RepoTermPoint[] format expected by Next.js."""
    return [
        {"plazo": p, "tasa": d["tasa"], "vol": d["vol"], "ops": d["ops"]}
        for p, d in sorted(plazos.items())
    ]


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    key   = get_api_key()
    today = today_iso()
    print(f"[fetch-mae] {utcnow_iso()}  date={today}")

    # 1. Load existing snapshot
    snap         = load_snapshot()
    repo_history: list[dict] = snap.get("repoHistory", [])

    # 2. Today's repos
    print("Fetching /repo …")
    today_plazos = fetch_today_repos(key, today)
    if today_plazos:
        print(f"  plazos: {list(today_plazos.keys())}")
        today_entry = {"fecha": today, "plazos": today_plazos}

        # Upsert: replace if today already in history
        idx = next((i for i, d in enumerate(repo_history) if d["fecha"] == today), None)
        if idx is not None:
            repo_history[idx] = today_entry
        else:
            repo_history.append(today_entry)

        # Sort chronologically and keep last 90 days
        repo_history.sort(key=lambda x: x["fecha"])
        repo_history = repo_history[-MAX_HISTORY_DAYS:]
    else:
        print("  no repo data (market closed or holiday)")

    # 3. Today's snapshots
    print("Fetching /cauciones …")
    cauciones = fetch_endpoint("cauciones", key)
    print(f"  {len(cauciones)} items")

    print("Fetching /rentafija …")
    rentafija = fetch_endpoint("rentafija", key)
    print(f"  {len(rentafija)} items")

    print("Fetching /forex …")
    forex = fetch_endpoint("forex", key)
    print(f"  {len(forex)} items")

    # 4. Build latestCurve  (prefer today's; fall back to previous)
    latest_curve = (
        build_latest_curve(today_plazos)
        if today_plazos
        else snap.get("latestCurve", [])
    )

    # 5. Write
    new_snap = {
        "fetchedAt":   utcnow_iso(),
        "repoHistory": repo_history,
        "cauciones":   cauciones,
        "rentafija":   rentafija,
        "forex":       forex,
        "latestCurve": latest_curve,
    }
    save_snapshot(new_snap)
    print(f"History: {len(repo_history)} days  |  "
          f"rentafija: {len(rentafija)}  |  "
          f"cauciones: {len(cauciones)}  |  "
          f"forex: {len(forex)}")


if __name__ == "__main__":
    main()
