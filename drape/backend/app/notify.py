"""In-app notifications, plus email through Resend when a key is set."""
from __future__ import annotations

import logging
import uuid

import httpx
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Notification, Profile

log = logging.getLogger("drape.notify")


def send_email(to: str, subject: str, text: str) -> bool:
    s = get_settings()
    if not s.resend_api_key or not to:
        return False
    try:
        r = httpx.post("https://api.resend.com/emails", timeout=10,
                       headers={"Authorization": f"Bearer {s.resend_api_key}"},
                       json={"from": s.email_from, "to": [to], "subject": subject, "text": text})
        if r.status_code >= 300:
            log.warning("email not sent: status %s", r.status_code)
            return False
        return True
    except httpx.HTTPError:
        log.warning("email not sent: network error")
        return False


def notify(db: Session, profile: Profile, kind: str, title: str, body: str, link: str | None = None) -> Notification:
    n = Notification(id=uuid.uuid4(), user_id=profile.id, kind=kind, title=title, body=body, link=link)
    if profile.notify_email and profile.email:
        url = get_settings().public_base_url.rstrip("/") + (link or "/")
        n.emailed = send_email(profile.email, title, f"{body}\n\n{url}\n\nYou can turn these emails off in Drape settings.")
    db.add(n)
    return n
