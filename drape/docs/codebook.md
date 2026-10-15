# Drape study codebook

Generated from `backend/app/study_export.py`. Regenerate with `python -m app.study_export` from `backend/`.

Both files identify people only by a pseudonymous participant code. They never contain names, emails, account ids, photos, image paths or product links.

## Wide file (one row per decision)

Analysis-ready: one row per item a participant decided on, with the 48-hour follow-up joined in.

| Column | Description |
|---|---|
| `participant_code` | Pseudonymous code, P plus 6 characters. The only participant identifier in the file. |
| `design` | between_subject or within_subject_counterbalanced, fixed when the participant joined. |
| `arm` | Assigned arm. Between-subject: control or treatment. Within-subject: AB (control first) or BA (treatment first). |
| `block_index` | Randomization block the participant was allocated in (0 based). |
| `trial_index` | Order of this decision for the participant, starting at 1. |
| `condition` | What the participant saw for this item: control (product only) or treatment (product plus wardrobe information). |
| `decision` | save (Save for 48 hours) or keep_browsing. |
| `reason_own_similar` | 1 if the participant ticked "I already own something similar", else 0. |
| `reason_not_go_with` | 1 if the participant ticked "It does not go with my clothes", else 0. |
| `reason_price` | 1 if the participant ticked "Price", else 0. |
| `reason_not_need` | 1 if the participant ticked "I do not need it", else 0. |
| `reason_love_it` | 1 if the participant ticked "I love it", else 0. |
| `reason_occasion` | 1 if the participant ticked "I need it for an occasion", else 0. |
| `reason_other` | 1 if the participant ticked "Other", else 0. |
| `reason_other_text` | Free text for Other, with emails, links and phone numbers replaced by [redacted]. Empty when not given. |
| `confidence` | How sure the participant felt about the decision, 1 (not at all) to 7 (completely). |
| `time_on_page_ms` | Milliseconds from first view of the item page to the decision. |
| `shown_at` | UTC time the item page was first shown (ISO 8601). |
| `decided_at` | UTC time of the decision (ISO 8601). |
| `similar_count` | Number of owned pieces shown as similar. Computed for both conditions; only shown to treatment. |
| `new_outfit_count` | New outfits the item would add. Computed for both conditions; only shown to treatment. |
| `followup_bought` | Answer 48 hours later: yes, no or unsure. Empty when not answered yet. |
| `followup_still_want` | Still want it, 1 (not at all) to 7 (very much). Empty when not answered. |
| `followup_hours_after` | Hours between the decision and the follow-up answer. |
| `withdrawn` | 1 if the participant later withdrew but kept their data, else 0. |

## Long file (one row per measure)

Tidy format: one row per recorded value, including optional usability task timers.

| Column | Description |
|---|---|
| `participant_code` | Pseudonymous code, as in the wide file. |
| `design` | Study design for this participant. |
| `arm` | Assigned arm. |
| `trial_index` | Decision order for the participant. Empty for task timer rows. |
| `condition` | control or treatment. Empty for task timer rows. |
| `measure` | What the row records: decision, reason, reason_other_text, confidence, time_on_page_ms, followup_bought, followup_still_want, or task_seconds:<task>. |
| `value` | The value for that measure. Reasons are one row per ticked reason. |
| `recorded_at` | UTC time the value was recorded (ISO 8601). |

## Settings

- Design: `between_subject` (options: between_subject, within_subject_counterbalanced)
- Block size: 4
- Target sample size: 40
- Consent version: `study-consent-v1`
- Confidence scale: 1 to 7
- Follow-up after: 48 hours

Change these in `backend/app/study_config.py` or with the `STUDY_*` environment variables.
