"""Every study setting in one place. Change these before recruiting.

Sample size, design, reasons and the consent version live here so the
research team can adjust them without touching the rest of the code.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Planned participants. Used by the admin page to show progress; recruitment is not blocked when reached.
TARGET_SAMPLE_SIZE = int(os.environ.get("STUDY_TARGET_N", "40"))

# between_subject: each participant sees one condition for every item.
# within_subject_counterbalanced: each participant sees both, alternating item by item,
# starting with control (order AB) or treatment (order BA), balanced across participants.
DESIGN = os.environ.get("STUDY_DESIGN", "between_subject")
DESIGNS = ("between_subject", "within_subject_counterbalanced")

# Blocked randomization. Block size must be a multiple of the number of arms.
BLOCK_SIZE = int(os.environ.get("STUDY_BLOCK_SIZE", "4"))
# Secret seed so participants cannot predict the next assignment. Set it in Space secrets.
SEED = os.environ.get("STUDY_SEED", "drape-study-seed-change-me")

ARMS = {"between_subject": ["control", "treatment"], "within_subject_counterbalanced": ["AB", "BA"]}

CONSENT_VERSION = "study-consent-v1"
CONSENT_FILE = ROOT / "study" / "consent-v1.md"

REASONS: list[tuple[str, str]] = [
    ("own_similar", "I already own something similar"),
    ("not_go_with", "It does not go with my clothes"),
    ("price", "Price"),
    ("not_need", "I do not need it"),
    ("love_it", "I love it"),
    ("occasion", "I need it for an occasion"),
    ("other", "Other"),
]
CONFIDENCE_SCALE = (1, 7)  # 1 = not at all sure, 7 = completely sure
STILL_WANT_SCALE = (1, 7)  # 1 = not at all, 7 = very much
FOLLOWUP_HOURS = 48
TASKS = ("setup", "outfit_choice", "purchase_review", "photo_matching")
