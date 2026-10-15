"""Apply SQL migrations in order. Used locally, in CI and on container start.

On Supabase you can also paste the files into the SQL editor or use
`supabase db push`; the runner records what it applied in `_drape_migrations`.
"""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text

from .config import ROOT
from .db import get_engine

MIGRATIONS = ROOT / "supabase" / "migrations"
BOOTSTRAP = ROOT / "supabase" / "local" / "bootstrap.sql"


def _raw(conn, sql: str) -> None:
    """Run a whole SQL file without placeholder parsing (format('%I') etc.)."""
    with conn.connection.driver_connection.cursor() as cur:
        cur.execute(sql)


def apply(bootstrap: bool = False) -> list[str]:
    applied: list[str] = []
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text("create table if not exists _drape_migrations (name text primary key, applied_at timestamptz default now())"))
        done = {r[0] for r in conn.execute(text("select name from _drape_migrations"))}
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.name in done:
                continue
            _raw(conn, path.read_text())
            conn.execute(text("insert into _drape_migrations (name) values (:n)"), {"n": path.name})
            applied.append(path.name)
        conn.execute(text("alter table _drape_migrations enable row level security"))
        if bootstrap:
            _raw(conn, BOOTSTRAP.read_text())
    return applied


if __name__ == "__main__":
    names = apply(bootstrap="--bootstrap" in sys.argv)
    print("Applied:", ", ".join(names) if names else "nothing new")
