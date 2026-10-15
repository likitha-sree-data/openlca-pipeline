"""Study summaries and CSV exports, plus the codebook that describes them.

Exports use the pseudonymous participant code only. They never include
names, emails, user ids, image paths or product links. Free-text "Other"
reasons are kept for analysis with email addresses, links and phone
numbers redacted.
"""
from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import study_config as cfg
from .models import StudyDecision, StudyFollowup, StudyParticipant, StudyTaskTimer

REASON_IDS = [k for k, _ in cfg.REASONS]

# column name -> description. The codebook is generated from these.
WIDE_COLUMNS: dict[str, str] = {
    "participant_code": "Pseudonymous code, P plus 6 characters. The only participant identifier in the file.",
    "design": "between_subject or within_subject_counterbalanced, fixed when the participant joined.",
    "arm": "Assigned arm. Between-subject: control or treatment. Within-subject: AB (control first) or BA (treatment first).",
    "block_index": "Randomization block the participant was allocated in (0 based).",
    "trial_index": "Order of this decision for the participant, starting at 1.",
    "condition": "What the participant saw for this item: control (product only) or treatment (product plus wardrobe information).",
    "decision": "save (Save for 48 hours) or keep_browsing.",
    **{f"reason_{r}": f"1 if the participant ticked \"{label}\", else 0." for r, label in cfg.REASONS},
    "reason_other_text": "Free text for Other, with emails, links and phone numbers replaced by [redacted]. Empty when not given.",
    "confidence": "How sure the participant felt about the decision, 1 (not at all) to 7 (completely).",
    "time_on_page_ms": "Milliseconds from first view of the item page to the decision.",
    "shown_at": "UTC time the item page was first shown (ISO 8601).",
    "decided_at": "UTC time of the decision (ISO 8601).",
    "similar_count": "Number of owned pieces shown as similar. Computed for both conditions; only shown to treatment.",
    "new_outfit_count": "New outfits the item would add. Computed for both conditions; only shown to treatment.",
    "followup_bought": "Answer 48 hours later: yes, no or unsure. Empty when not answered yet.",
    "followup_still_want": "Still want it, 1 (not at all) to 7 (very much). Empty when not answered.",
    "followup_hours_after": "Hours between the decision and the follow-up answer.",
    "withdrawn": "1 if the participant later withdrew but kept their data, else 0.",
}
LONG_COLUMNS: dict[str, str] = {
    "participant_code": "Pseudonymous code, as in the wide file.",
    "design": "Study design for this participant.",
    "arm": "Assigned arm.",
    "trial_index": "Decision order for the participant. Empty for task timer rows.",
    "condition": "control or treatment. Empty for task timer rows.",
    "measure": "What the row records: decision, reason, reason_other_text, confidence, time_on_page_ms, followup_bought, followup_still_want, or task_seconds:<task>.",
    "value": "The value for that measure. Reasons are one row per ticked reason.",
    "recorded_at": "UTC time the value was recorded (ISO 8601).",
}

_REDACT = [
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    re.compile(r"https?://\S+|www\.\S+"),
    re.compile(r"\+?\d[\d\s().-]{7,}\d"),
]


def redact(text: str | None) -> str:
    if not text:
        return ""
    for rx in _REDACT:
        text = rx.sub("[redacted]", text)
    return text.replace("\n", " ").strip()


def _rows(db: Session) -> list[tuple[StudyParticipant, StudyDecision, StudyFollowup | None]]:
    decisions = db.execute(select(StudyParticipant, StudyDecision).join(StudyDecision, StudyDecision.participant_id == StudyParticipant.id)
                           .order_by(StudyParticipant.alloc_index, StudyDecision.trial_index)).all()
    follow = {f.decision_id: f for f in db.scalars(select(StudyFollowup))}
    return [(p, d, follow.get(d.id)) for p, d in decisions]


def wide_rows(db: Session) -> list[dict[str, Any]]:
    out = []
    for p, d, f in _rows(db):
        row: dict[str, Any] = {
            "participant_code": p.code, "design": p.design, "arm": p.arm, "block_index": p.block_index, "trial_index": d.trial_index,
            "condition": d.condition, "decision": d.decision,
            **{f"reason_{r}": int(r in (d.reasons or [])) for r in REASON_IDS},
            "reason_other_text": redact(d.reason_other), "confidence": d.confidence, "time_on_page_ms": d.time_on_page_ms,
            "shown_at": d.shown_at.isoformat(), "decided_at": d.decided_at.isoformat(),
            "similar_count": d.similar_count, "new_outfit_count": d.new_outfit_count,
            "followup_bought": f.bought if f else "", "followup_still_want": f.still_want if f and f.still_want is not None else "",
            "followup_hours_after": round((f.created_at - d.decided_at).total_seconds() / 3600, 1) if f else "",
            "withdrawn": int(p.withdrawn_at is not None),
        }
        out.append(row)
    return out


def long_rows(db: Session) -> list[dict[str, Any]]:
    out = []

    def add(p, trial, cond, measure, value, at):
        out.append({"participant_code": p.code, "design": p.design, "arm": p.arm, "trial_index": trial, "condition": cond,
                    "measure": measure, "value": value, "recorded_at": at.isoformat() if at else ""})

    for p, d, f in _rows(db):
        add(p, d.trial_index, d.condition, "decision", d.decision, d.decided_at)
        for r in d.reasons or []:
            add(p, d.trial_index, d.condition, "reason", r, d.decided_at)
        if d.reason_other:
            add(p, d.trial_index, d.condition, "reason_other_text", redact(d.reason_other), d.decided_at)
        add(p, d.trial_index, d.condition, "confidence", d.confidence, d.decided_at)
        add(p, d.trial_index, d.condition, "time_on_page_ms", d.time_on_page_ms, d.decided_at)
        if f:
            add(p, d.trial_index, d.condition, "followup_bought", f.bought, f.created_at)
            if f.still_want is not None:
                add(p, d.trial_index, d.condition, "followup_still_want", f.still_want, f.created_at)
    timers = db.execute(select(StudyParticipant, StudyTaskTimer).join(StudyTaskTimer, StudyTaskTimer.participant_id == StudyParticipant.id)).all()
    for p, t in timers:
        if t.ended_at:
            add(p, "", "", f"task_seconds:{t.task}", int((t.ended_at - t.started_at).total_seconds()), t.ended_at)
    return out


def to_csv(db: Session, kind: str) -> str:
    cols = WIDE_COLUMNS if kind == "wide" else LONG_COLUMNS
    rows = wide_rows(db) if kind == "wide" else long_rows(db)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(cols), extrasaction="raise")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    return buf.getvalue()


def summarize(db: Session) -> dict[str, Any]:
    participants = list(db.scalars(select(StudyParticipant)))
    by_arm: dict[str, int] = defaultdict(int)
    for p in participants:
        by_arm[p.arm] += 1
    rows = _rows(db)
    per: dict[str, dict[str, Any]] = {}
    for cond in ("control", "treatment"):
        ds = [(d, f) for _, d, f in rows if d.condition == cond]
        answered = [f for _, f in ds if f]
        per[cond] = {
            "decisions": len(ds),
            "save_rate": round(sum(d.decision == "save" for d, _ in ds) / len(ds), 3) if ds else None,
            "mean_confidence": round(mean(d.confidence for d, _ in ds), 2) if ds else None,
            "followups": len(answered),
            "bought_rate": round(sum(f.bought == "yes" for f in answered) / len(answered), 3) if answered else None,
        }
    return {
        "design": cfg.DESIGN,
        "target_sample_size": cfg.TARGET_SAMPLE_SIZE,
        "participants": len(participants),
        "active": sum(p.withdrawn_at is None for p in participants),
        "participants_by_arm": dict(by_arm),
        "by_condition": per,
    }


def codebook_markdown() -> str:
    lines = [
        "# Drape study codebook",
        "",
        "Generated from `backend/app/study_export.py`. Regenerate with `python -m app.study_export` from `backend/`.",
        "",
        "Both files identify people only by a pseudonymous participant code. They never contain names, emails, account ids, "
        "photos, image paths or product links.",
        "",
        "## Wide file (one row per decision)",
        "",
        "Analysis-ready: one row per item a participant decided on, with the 48-hour follow-up joined in.",
        "",
        "| Column | Description |",
        "|---|---|",
        *[f"| `{k}` | {v} |" for k, v in WIDE_COLUMNS.items()],
        "",
        "## Long file (one row per measure)",
        "",
        "Tidy format: one row per recorded value, including optional usability task timers.",
        "",
        "| Column | Description |",
        "|---|---|",
        *[f"| `{k}` | {v} |" for k, v in LONG_COLUMNS.items()],
        "",
        "## Settings",
        "",
        f"- Design: `{cfg.DESIGN}` (options: {', '.join(cfg.DESIGNS)})",
        f"- Block size: {cfg.BLOCK_SIZE}",
        f"- Target sample size: {cfg.TARGET_SAMPLE_SIZE}",
        f"- Consent version: `{cfg.CONSENT_VERSION}`",
        f"- Confidence scale: {cfg.CONFIDENCE_SCALE[0]} to {cfg.CONFIDENCE_SCALE[1]}",
        f"- Follow-up after: {cfg.FOLLOWUP_HOURS} hours",
        "",
        "Change these in `backend/app/study_config.py` or with the `STUDY_*` environment variables.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[2] / "docs" / "codebook.md"
    out.write_text(codebook_markdown(), encoding="utf-8")
    print(out)
