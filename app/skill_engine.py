"""Skill-based recommendation engine for exam tasks.

Uses Neo4j graph (skills, prerequisites, tasks) + Supabase attempt history
to recommend the best next task for a student.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from neo4j import Driver

MASTERY_THRESHOLD = 0.7
SPACED_INTERVALS_DAYS = [1, 3, 7, 14]

MASTERY_WEIGHTS = {
    "answer_and_reasoning": 1.0,
    "answer_only_correct": 0.6,
    "answer_correct_reasoning_wrong": 0.3,
    "incorrect": 0.0,
}


def _compute_attempt_score(attempt: dict) -> float:
    """Compute a mastery score for a single attempt."""
    ai = attempt.get("ai_feedback") or {}
    answer_data = attempt.get("answer_data") or {}
    is_correct = attempt.get("is_correct", False)

    if not is_correct:
        return MASTERY_WEIGHTS["incorrect"]

    reasoning = ai.get("poprawne_rozumowanie")
    if reasoning is True:
        return MASTERY_WEIGHTS["answer_and_reasoning"]
    elif reasoning is False:
        return MASTERY_WEIGHTS["answer_correct_reasoning_wrong"]
    else:
        hints_used = answer_data.get("hints_used", 0)
        base = MASTERY_WEIGHTS["answer_only_correct"]
        return max(0.1, base - hints_used * 0.15)


def compute_skill_mastery(
    attempts: list[dict],
    zadanie_skill_map: dict[str, list[str]],
) -> dict[str, dict]:
    """Compute mastery per skill from attempt history.

    Returns {skill_id: {"level": float, "attempts": int, "last_correct_at": datetime|None,
                         "interval_index": int}}
    """
    skill_scores: dict[str, list[tuple[float, datetime | None]]] = {}

    for att in attempts:
        zid = att.get("zadanie_id", "")
        skills = zadanie_skill_map.get(zid, [])
        score = _compute_attempt_score(att)
        created = att.get("created_at")
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            except ValueError:
                created = None

        for sid in skills:
            skill_scores.setdefault(sid, []).append((score, created))

    mastery: dict[str, dict] = {}
    for sid, entries in skill_scores.items():
        scores = [s for s, _ in entries]
        avg = sum(scores) / len(scores) if scores else 0.0

        correct_dates = [d for s, d in entries if s > 0 and d is not None]
        last_correct = max(correct_dates) if correct_dates else None

        consecutive_correct = 0
        for s, _ in reversed(entries):
            if s >= MASTERY_WEIGHTS["answer_only_correct"]:
                consecutive_correct += 1
            else:
                break

        interval_index = min(consecutive_correct, len(SPACED_INTERVALS_DAYS) - 1)

        mastery[sid] = {
            "level": avg,
            "attempts": len(entries),
            "last_correct_at": last_correct,
            "interval_index": interval_index,
        }

    return mastery


def get_skills_due_for_review(
    mastery: dict[str, dict],
    now: datetime | None = None,
) -> list[str]:
    """Return skill IDs that are due for spaced-repetition review."""
    if now is None:
        now = datetime.now(timezone.utc)

    due = []
    for sid, info in mastery.items():
        if info["level"] <= 0:
            continue
        last = info.get("last_correct_at")
        if last is None:
            continue
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        idx = info.get("interval_index", 0)
        interval = SPACED_INTERVALS_DAYS[min(idx, len(SPACED_INTERVALS_DAYS) - 1)]
        if now - last >= timedelta(days=interval):
            due.append(sid)
    return due


def get_available_skills(
    all_skills: list[str],
    mastery: dict[str, dict],
    locked_skill_ids: set[str] | None = None,
) -> list[str]:
    """Return skill IDs that are not yet mastered and not admin-locked.

    Ordered by lowest mastery first (Ebbinghaus: weak skills recommended more often).
    """
    locked = locked_skill_ids or set()
    available = []
    for sid in all_skills:
        if sid in locked:
            continue
        m = mastery.get(sid, {})
        if m.get("level", 0) >= MASTERY_THRESHOLD:
            continue
        available.append(sid)

    # Prioritize lowest mastery (weak skills recommended more often)
    available.sort(key=lambda s: mastery.get(s, {}).get("level", 0))
    return available


def recommend_task(
    driver: Driver,
    user_id: str,
    attempts: list[dict],
    recent_dzial_ids: list[int] | None = None,
    target_skill_id: str | None = None,
    locked_skill_ids: set[str] | None = None,
) -> Optional[dict]:
    """Recommend a task for the student.

    Priority:
    1. If target_skill_id is set, pick a task testing that skill (unless locked)
    2. Skills due for spaced-repetition review (Ebbinghaus curve)
    3. Available skills (not mastered, not locked), lowest mastery first, interleaved across dzialy
    4. Fallback: random unattempted task
    """
    with driver.session() as session:
        zadanie_skill_map = _fetch_zadanie_skill_map(session)
        all_skills = _fetch_all_skill_ids(session)
        skill_dzial_map = _fetch_skill_dzial_map(session)

    mastery = compute_skill_mastery(attempts, zadanie_skill_map)
    attempted_ids = {a["zadanie_id"] for a in attempts}
    locked = locked_skill_ids or set()

    if target_skill_id and target_skill_id not in locked:
        return _pick_task_for_skills(
            driver, [target_skill_id], attempted_ids, zadanie_skill_map
        )

    due_skills = [s for s in get_skills_due_for_review(mastery) if s not in locked]
    if due_skills:
        if recent_dzial_ids:
            due_skills = _interleave_filter(due_skills, skill_dzial_map, recent_dzial_ids)
        if due_skills:
            return _pick_task_for_skills(driver, due_skills, attempted_ids, zadanie_skill_map)

    available = get_available_skills(all_skills, mastery, locked)
    if available:
        if recent_dzial_ids:
            available = _interleave_filter(available, skill_dzial_map, recent_dzial_ids)
        if available:
            return _pick_task_for_skills(driver, available, attempted_ids, zadanie_skill_map)

    return _pick_random_task(driver, attempted_ids)


def _interleave_filter(
    skill_ids: list[str],
    skill_dzial_map: dict[str, int],
    recent_dzial_ids: list[int],
) -> list[str]:
    """Prefer skills from dzialy NOT recently used."""
    recent_set = set(recent_dzial_ids[-3:]) if recent_dzial_ids else set()
    filtered = [s for s in skill_ids if skill_dzial_map.get(s) not in recent_set]
    return filtered if filtered else skill_ids


def _pick_task_for_skills(
    driver: Driver,
    skill_ids: list[str],
    attempted_ids: set[str],
    zadanie_skill_map: dict[str, list[str]],
) -> Optional[dict]:
    """Pick a task that tests one of the given skills, preferring unattempted."""
    candidates = set()
    for zid, sids in zadanie_skill_map.items():
        if any(s in skill_ids for s in sids):
            candidates.add(zid)

    unattempted = candidates - attempted_ids
    pool = unattempted if unattempted else candidates

    if not pool:
        return None

    chosen_id = random.choice(list(pool))
    return _fetch_zadanie_by_id(driver, chosen_id)


def _pick_random_task(driver: Driver, attempted_ids: set[str]) -> Optional[dict]:
    """Pick a random task the student hasn't attempted."""
    with driver.session() as session:
        result = session.run("MATCH (z:Zadanie) RETURN z.id AS id")
        all_ids = [r["id"] for r in result]

    unattempted = [i for i in all_ids if i not in attempted_ids]
    pool = unattempted if unattempted else all_ids

    if not pool:
        return None

    chosen_id = random.choice(pool)
    return _fetch_zadanie_by_id(driver, chosen_id)


# --- Neo4j query helpers ---

def _fetch_zadanie_by_id(driver: Driver, zadanie_id: str) -> Optional[dict]:
    with driver.session() as session:
        result = session.run(
            """
            MATCH (z:Zadanie {id: $zid})
            OPTIONAL MATCH (z)-[:SPRAWDZA]->(u:Umiejetnosc)
            RETURN z, collect({id: u.id, opis: u.opis}) AS umiejetnosci
            """,
            zid=zadanie_id,
        )
        record = result.single()
        if not record:
            return None
        z = record["z"]
        umiejetnosci = [u for u in record["umiejetnosci"] if u.get("id")]
        return {
            "id": z["id"],
            "numer": z.get("numer"),
            "data": z.get("data"),
            "punkty": z.get("punkty", 1),
            "typ": z.get("typ", ""),
            "podtyp": z.get("podtyp", ""),
            "tresc": z.get("tresc", ""),
            "odpowiedzi": z.get("odpowiedzi", []),
            "tikz": z.get("tikz", ""),
            "umiejetnosci": umiejetnosci,
        }


def _fetch_zadanie_skill_map(session) -> dict[str, list[str]]:
    result = session.run(
        "MATCH (z:Zadanie)-[:SPRAWDZA]->(u:Umiejetnosc) RETURN z.id AS zid, collect(u.id) AS sids"
    )
    return {r["zid"]: r["sids"] for r in result}


def _fetch_all_skill_ids(session) -> list[str]:
    result = session.run("MATCH (u:Umiejetnosc) RETURN u.id AS id")
    return [r["id"] for r in result]


def _fetch_wymaga_edges(session) -> list[tuple[str, str]]:
    result = session.run(
        "MATCH (a:Umiejetnosc)-[:WYMAGA]->(b:Umiejetnosc) RETURN a.id AS from_id, b.id AS to_id"
    )
    return [(r["from_id"], r["to_id"]) for r in result]


def _fetch_skill_dzial_map(session) -> dict[str, int]:
    result = session.run(
        "MATCH (d:Dzial)-[:ZAWIERA]->(u:Umiejetnosc) RETURN u.id AS uid, d.id AS did"
    )
    return {r["uid"]: r["did"] for r in result}


def fetch_dzialy(driver: Driver) -> list[dict]:
    with driver.session() as session:
        result = session.run("MATCH (d:Dzial) RETURN d.id AS id, d.nazwa AS nazwa ORDER BY d.id")
        return [{"id": r["id"], "nazwa": r["nazwa"]} for r in result]


def fetch_all_tasks(driver: Driver, skip: int = 0, limit: int = 500) -> list[dict]:
    """Fetch all Zadanie nodes (temporary tool)."""
    with driver.session() as session:
        result = session.run(
            """
            MATCH (z:Zadanie)
            OPTIONAL MATCH (z)-[:SPRAWDZA]->(u:Umiejetnosc)
            WITH z, collect({id: u.id, opis: u.opis}) AS umiejetnosci
            RETURN z, umiejetnosci
            ORDER BY z.id
            SKIP $skip LIMIT $limit
            """,
            skip=skip,
            limit=limit,
        )
        tasks = []
        for record in result:
            z = record["z"]
            umiejetnosci = [u for u in record["umiejetnosci"] if u.get("id")]
            tasks.append({
                "id": z["id"],
                "numer": z.get("numer"),
                "data": z.get("data"),
                "punkty": z.get("punkty", 1),
                "typ": z.get("typ", ""),
                "podtyp": z.get("podtyp", ""),
                "tresc": z.get("tresc", ""),
                "odpowiedzi": z.get("odpowiedzi", []),
                "tikz": z.get("tikz", ""),
                "umiejetnosci": umiejetnosci,
            })
        return tasks


def fetch_tasks_by_dzial(driver: Driver, dzial_id: int, skip: int = 0, limit: int = 20) -> list[dict]:
    with driver.session() as session:
        result = session.run(
            """
            MATCH (d:Dzial {id: $did})-[:ZAWIERA]->(u:Umiejetnosc)<-[:SPRAWDZA]-(z:Zadanie)
            WITH DISTINCT z
            OPTIONAL MATCH (z)-[:SPRAWDZA]->(u2:Umiejetnosc)
            RETURN z, collect({id: u2.id, opis: u2.opis}) AS umiejetnosci
            ORDER BY z.id
            SKIP $skip LIMIT $limit
            """,
            did=dzial_id,
            skip=skip,
            limit=limit,
        )
        tasks = []
        for record in result:
            z = record["z"]
            umiejetnosci = [u for u in record["umiejetnosci"] if u.get("id")]
            tasks.append({
                "id": z["id"],
                "numer": z.get("numer"),
                "data": z.get("data"),
                "punkty": z.get("punkty", 1),
                "typ": z.get("typ", ""),
                "podtyp": z.get("podtyp", ""),
                "tresc": z.get("tresc", ""),
                "odpowiedzi": z.get("odpowiedzi", []),
                "tikz": z.get("tikz", ""),
                "umiejetnosci": umiejetnosci,
            })
        return tasks


def fetch_random_task(driver: Driver, dzial_id: int | None = None) -> Optional[dict]:
    with driver.session() as session:
        if dzial_id is not None:
            result = session.run(
                """
                MATCH (d:Dzial {id: $did})-[:ZAWIERA]->(u:Umiejetnosc)<-[:SPRAWDZA]-(z:Zadanie)
                WITH DISTINCT z, rand() AS r
                ORDER BY r LIMIT 1
                OPTIONAL MATCH (z)-[:SPRAWDZA]->(u2:Umiejetnosc)
                RETURN z, collect({id: u2.id, opis: u2.opis}) AS umiejetnosci
                """,
                did=dzial_id,
            )
        else:
            result = session.run(
                """
                MATCH (z:Zadanie)
                WITH z, rand() AS r
                ORDER BY r LIMIT 1
                OPTIONAL MATCH (z)-[:SPRAWDZA]->(u:Umiejetnosc)
                RETURN z, collect({id: u.id, opis: u.opis}) AS umiejetnosci
                """
            )
        record = result.single()
        if not record:
            return None
        z = record["z"]
        umiejetnosci = [u for u in record["umiejetnosci"] if u.get("id")]
        return {
            "id": z["id"],
            "numer": z.get("numer"),
            "data": z.get("data"),
            "punkty": z.get("punkty", 1),
            "typ": z.get("typ", ""),
            "podtyp": z.get("podtyp", ""),
            "tresc": z.get("tresc", ""),
            "odpowiedzi": z.get("odpowiedzi", []),
            "tikz": z.get("tikz", ""),
            "umiejetnosci": umiejetnosci,
        }


def fetch_skill_map(
    driver: Driver,
    user_attempts: list[dict],
    locked_skill_ids: set[str] | None = None,
) -> dict:
    """Return the full skill graph with mastery data for the skill map visualization.

    locked_skill_ids: admin-locked skill IDs for this user (only these show as 'locked').
    """
    with driver.session() as session:
        zadanie_skill_map = _fetch_zadanie_skill_map(session)

        dzialy_raw = session.run(
            "MATCH (d:Dzial) RETURN d.id AS id, d.nazwa AS nazwa ORDER BY d.id"
        )
        dzialy = [{"id": r["id"], "nazwa": r["nazwa"]} for r in dzialy_raw]

        skills_raw = session.run(
            """
            MATCH (d:Dzial)-[:ZAWIERA]->(u:Umiejetnosc)
            RETURN u.id AS id, u.opis AS opis, d.id AS dzial_id
            """
        )
        umiejetnosci = [
            {"id": r["id"], "opis": r["opis"], "dzial_id": r["dzial_id"]}
            for r in skills_raw
        ]

        wymaga_raw = session.run(
            "MATCH (a:Umiejetnosc)-[:WYMAGA]->(b:Umiejetnosc) RETURN a.id AS from_id, b.id AS to_id"
        )
        wymaga_edges = [
            {"from": r["from_id"], "to": r["to_id"]}
            for r in wymaga_raw
        ]

    mastery = compute_skill_mastery(user_attempts, zadanie_skill_map)
    locked = locked_skill_ids or set()

    mastery_out = {}
    for u in umiejetnosci:
        sid = u["id"]
        m = mastery.get(sid, {})
        level = m.get("level", 0)
        attempts = m.get("attempts", 0)

        if sid in locked:
            status = "locked"
        elif level >= MASTERY_THRESHOLD:
            status = "mastered"
        elif attempts > 0:
            status = "in_progress"
        else:
            status = "available"

        mastery_out[sid] = {
            "level": round(level, 2),
            "attempts": attempts,
            "status": status,
        }

    return {
        "dzialy": dzialy,
        "umiejetnosci": umiejetnosci,
        "wymaga_edges": wymaga_edges,
        "mastery": mastery_out,
    }
