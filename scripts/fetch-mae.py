#!/usr/bin/env python3
"""
Fetch MAE market data and write/update public/data/mae-snapshot.json.

Designed to run from GitHub Actions, where MAE's Incapsula WAF does NOT block
GitHub/Microsoft IP ranges (unlike Vercel/AWS Lambda which are blocked).

Data flow:
  1. Load existing snapshot  (to preserve repo history)
  2. Fetch repo history      (last 90 days if first run, else last 7 days)
  3. Upsert into repoHistory, trim to MAX_HISTORY_DAYS
  4. Fetch /cauciones, /rentafija, /forex   (today's market snapshots)
  5. Write new snapshot to public/data/mae-snapshot.json
"""

from __future__ import annotations

import json
import os
import sys
import datetime
import requests
from pathlib import Path
from typing import Dict, List, Any, Optional

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


def mae_get(path: str, params: dict, key: str) -> Any:
    """GET a MAE endpoint, raise on non-200."""
    url = "{}{}".format(BASE_URL, path)
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


def days_ago_iso(n: int) -> str:
    return (datetime.date.today() - datetime.timedelta(days=n)).isoformat()


def utcnow_iso() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


# ── Snapshot persistence ──────────────────────────────────────────────────────

def load_snapshot() -> dict:
    """Load existing snapshot or return a blank skeleton."""
    if SNAPSHOT_PATH.exists():
        try:
            with open(str(SNAPSHOT_PATH), encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            print("Warning: could not parse existing snapshot ({}), starting fresh".format(exc),
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
    with open(str(SNAPSHOT_PATH), "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = SNAPSHOT_PATH.stat().st_size / 1024
    print("Snapshot saved → {}  ({:.1f} KB)".format(SNAPSHOT_PATH, size_kb))


# ── MAE fetchers ──────────────────────────────────────────────────────────────

def fetch_repo_range(key: str, desde: str, hasta: str) -> List[dict]:
    """
    Fetch /repo for a date range (paginated, up to 10 pages).
    Returns list of raw records from MAE.
    """
    all_records: List[dict] = []
    for page in range(1, 11):
        try:
            batch = mae_get(
                "/mercado/cotizaciones/repo",
                {"fechaDesde": desde, "fechaHasta": hasta, "pageNumber": page},
                key,
            )
        except Exception as exc:
            print("  repo page {} failed: {}".format(page, exc), file=sys.stderr)
            break

        if not isinstance(batch, list) or len(batch) == 0:
            break
        all_records.extend(batch)
        if len(batch) < 50:
            break  # last page

    return all_records


def parse_repo_records(records: List[dict]) -> Dict[str, dict]:
    """
    Convert a flat list of MAE repo records into a dict keyed by fecha,
    each value being a dict of plazo → {tasa, vol, ops}.
    """
    by_date: Dict[str, Dict[str, dict]] = {}
    for r in records:
        fecha = str(r.get("fecha", ""))[:10]
        if not fecha:
            continue
        # Normalize plazo to 3-char zero-padded string
        plazo = str(r.get("plazo", "")).strip().zfill(3)
        if not plazo or plazo == "000":
            continue
        if fecha not in by_date:
            by_date[fecha] = {}
        by_date[fecha][plazo] = {
            "tasa": round(float(r.get("tasaPP", 0)), 4),
            "vol":  float(r.get("volumen",        0)),
            "ops":  int(  r.get("cantOperaciones", 0)),
        }
    return by_date


def fetch_endpoint(endpoint: str, key: str) -> list:
    """Fetch a snapshot endpoint. Returns [] on error or market closed."""
    try:
        data = mae_get("/mercado/cotizaciones/{}".format(endpoint), {"pageNumber": 1}, key)
        return data if isinstance(data, list) else []
    except Exception as exc:
        print("  {} fetch failed: {}".format(endpoint, exc), file=sys.stderr)
        return []


def build_latest_curve(plazos: dict) -> List[dict]:
    return [
        {"plazo": p, "tasa": d["tasa"], "vol": d["vol"], "ops": d["ops"]}
        for p, d in sorted(plazos.items())
    ]


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    key   = get_api_key()
    today = today_iso()
    print("[fetch-mae] {}  date={}".format(utcnow_iso(), today))

    # 1. Load existing snapshot
    snap         = load_snapshot()
    repo_history: List[dict] = snap.get("repoHistory", [])

    # 2. Decide how far back to fetch repo history
    existing_dates = {d["fecha"] for d in repo_history}
    if len(existing_dates) < 5:
        # First run (or nearly empty) — fetch full 90-day history
        desde = days_ago_iso(MAX_HISTORY_DAYS)
        print("Fetching repo history (last 90 days: {} → {}) …".format(desde, today))
    else:
        # Incremental: fetch last 7 days to catch any missed days + today
        desde = days_ago_iso(7)
        print("Fetching repo history (last 7 days: {} → {}) …".format(desde, today))

    raw_records = fetch_repo_range(key, desde, today)
    print("  {} raw records returned".format(len(raw_records)))

    if raw_records:
        by_date = parse_repo_records(raw_records)
        print("  dates with data: {}".format(sorted(by_date.keys())))

        # Upsert each date
        history_map: Dict[str, dict] = {d["fecha"]: d for d in repo_history}
        for fecha, plazos in by_date.items():
            history_map[fecha] = {"fecha": fecha, "plazos": plazos}

        # Sort and trim to MAX_HISTORY_DAYS
        repo_history = sorted(history_map.values(), key=lambda x: x["fecha"])
        repo_history = repo_history[-MAX_HISTORY_DAYS:]
    else:
        print("  no repo data returned (WAF block, holiday, or market closed)")

    # 3. Today's market snapshots (will be empty after market close — that's OK)
    print("Fetching /cauciones …")
    cauciones = fetch_endpoint("cauciones", key)
    print("  {} items".format(len(cauciones)))

    print("Fetching /rentafija …")
    rentafija = fetch_endpoint("rentafija", key)
    print("  {} items".format(len(rentafija)))

    print("Fetching /forex …")
    forex = fetch_endpoint("forex", key)
    print("  {} items".format(len(forex)))

    # 4. Build latestCurve from most recent repo day
    if repo_history:
        latest_day_plazos = repo_history[-1]["plazos"]
        latest_curve = build_latest_curve(latest_day_plazos)
    else:
        latest_curve = snap.get("latestCurve", [])

    # 5. If cauciones/rentafija/forex are empty, keep previous snapshot data
    #    so the UI still shows closing prices after market close
    if not cauciones:
        cauciones = snap.get("cauciones", [])
        if cauciones:
            print("  cauciones: using previous snapshot ({} items)".format(len(cauciones)))
    if not rentafija:
        rentafija = snap.get("rentafija", [])
        if rentafija:
            print("  rentafija: using previous snapshot ({} items)".format(len(rentafija)))
    if not forex:
        forex = snap.get("forex", [])
        if forex:
            print("  forex: using previous snapshot ({} items)".format(len(forex)))

    # 6. Write
    new_snap = {
        "fetchedAt":   utcnow_iso(),
        "repoHistory": repo_history,
        "cauciones":   cauciones,
        "rentafija":   rentafija,
        "forex":       forex,
        "latestCurve": latest_curve,
    }
    save_snapshot(new_snap)
    print("History: {} days  |  rentafija: {}  |  cauciones: {}  |  forex: {}".format(
        len(repo_history), len(rentafija), len(cauciones), len(forex)
    ))


if __name__ == "__main__":
    main()
