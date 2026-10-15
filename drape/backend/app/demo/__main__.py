"""Seed a demo sandbox from the command line and print a sign-in token.

    python -m app.demo
"""
from ..auth import issue_token
from ..db import session_scope
from .seed import DEMO_HOURS, seed_demo

with session_scope() as db:
    p = seed_demo(db)
    print("Demo user:", p.id)
    print("Token (valid 24 hours):", issue_token(p.id, None, hours=DEMO_HOURS, demo=True))
