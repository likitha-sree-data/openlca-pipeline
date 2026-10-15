"""ORM models. The SQL migrations are the source of truth; these mirror them."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    REAL,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _uuid() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _user() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), index=True)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str | None] = mapped_column(Text)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    demo_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    units: Mapped[str] = mapped_column(Text, default="c")
    nudge_days: Mapped[int] = mapped_column(Integer, default=90)
    notify_in_app: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=False)
    study_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    keep_original_photos: Mapped[bool] = mapped_column(Boolean, default=False)
    chat_photos_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    taste: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    storage_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    versatility_cache: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _created()


class Garment(Base):
    __tablename__ = "garments"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    subtype: Mapped[str | None] = mapped_column(Text)
    color_name: Mapped[str | None] = mapped_column(Text)
    color_hex: Mapped[str | None] = mapped_column(Text)
    hue: Mapped[float | None] = mapped_column(REAL)
    sat: Mapped[float | None] = mapped_column(REAL)
    val: Mapped[float | None] = mapped_column(REAL)
    pattern: Mapped[str] = mapped_column(Text, default="solid")
    formality: Mapped[int] = mapped_column(SmallInteger, default=1)
    warmth: Mapped[int] = mapped_column(SmallInteger, default=2)
    seasons: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    fiber_content: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    care: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    purchased_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(Text, default="active")
    image_path: Mapped[str | None] = mapped_column(Text)
    thumb_path: Mapped[str | None] = mapped_column(Text)
    original_path: Mapped[str | None] = mapped_column(Text)
    care_label_path: Mapped[str | None] = mapped_column(Text)
    cutout_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(512))
    sha256: Mapped[str | None] = mapped_column(Text)
    phash: Mapped[str | None] = mapped_column(Text)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    nudge_snoozed_until: Mapped[date | None] = mapped_column(Date)
    bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ScanDraft(Base):
    __tablename__ = "scan_drafts"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    result: Mapped[dict[str, Any]] = mapped_column(JSONB)
    image_path: Mapped[str | None] = mapped_column(Text)
    thumb_path: Mapped[str | None] = mapped_column(Text)
    original_path: Mapped[str | None] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(512))
    sha256: Mapped[str | None] = mapped_column(Text)
    phash: Mapped[str | None] = mapped_column(Text)
    bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = _created()


class Outfit(Base):
    __tablename__ = "outfits"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    name: Mapped[str | None] = mapped_column(Text)
    occasion: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, default="generated")
    saved: Mapped[bool] = mapped_column(Boolean, default=False)
    worn_on: Mapped[date | None] = mapped_column(Date)
    reasons: Mapped[list[str]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = _created()
    items: Mapped[list[OutfitItem]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    photo: Mapped[OutfitPhoto | None] = relationship(lazy="selectin", uselist=False, viewonly=True)


class OutfitItem(Base):
    __tablename__ = "outfit_items"
    outfit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("outfits.id", ondelete="CASCADE"), primary_key=True)
    garment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("garments.id", ondelete="CASCADE"), primary_key=True)
    slot: Mapped[str] = mapped_column(Text)


class WearLog(Base):
    __tablename__ = "wear_logs"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    garment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("garments.id", ondelete="CASCADE"))
    outfit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("outfits.id", ondelete="SET NULL"))
    worn_on: Mapped[date] = mapped_column(Date)
    source: Mapped[str] = mapped_column(Text)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OutfitPhoto(Base):
    __tablename__ = "outfit_photos"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    outfit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("outfits.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(Text, default="pending_review")
    detections: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    keep_original: Mapped[bool] = mapped_column(Boolean, default=False)
    original_path: Mapped[str | None] = mapped_column(Text)
    segmenter: Mapped[str | None] = mapped_column(Text)
    bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = _created()
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    plan_date: Mapped[date] = mapped_column(Date)
    occasion: Mapped[str | None] = mapped_column(Text)
    outfit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("outfits.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = _created()


class ColorPrefs(Base):
    __tablename__ = "color_prefs"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    favorites: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    avoid: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ColorProfilePhoto(Base):
    __tablename__ = "color_profile_photos"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    path: Mapped[str] = mapped_column(Text)
    palette: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = _created()


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    source_url: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    image_path: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(Text)
    color_hex: Mapped[str | None] = mapped_column(Text)
    scan: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(512))
    similar_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    similar: Mapped[list[dict[str, Any]]] = mapped_column("similar_items", JSONB, default=list)
    works_with_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    new_outfit_count: Mapped[int] = mapped_column(Integer, default=0)
    bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    condition: Mapped[str] = mapped_column(Text, default="treatment")
    decision: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    waiting: Mapped[WaitingItem | None] = relationship(lazy="selectin", uselist=False, viewonly=True)


class WaitingItem(Base):
    __tablename__ = "waiting_list"
    id: Mapped[uuid.UUID] = _uuid()
    review_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("reviews.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[uuid.UUID] = _user()
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, default="waiting")
    note: Mapped[str | None] = mapped_column(Text)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    kind: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(Text)
    emailed: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    role: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    outfit: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    garment_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    provider: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()


class Consent(Base):
    __tablename__ = "consents"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user()
    kind: Mapped[str] = mapped_column(Text)
    version: Mapped[str] = mapped_column(Text)
    granted_at: Mapped[datetime] = _created()
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StudyParticipant(Base):
    __tablename__ = "study_participants"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), unique=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    design: Mapped[str] = mapped_column(Text)
    alloc_index: Mapped[int] = mapped_column(Integer)
    block_index: Mapped[int] = mapped_column(Integer)
    arm: Mapped[str] = mapped_column(Text)
    consent_version: Mapped[str] = mapped_column(Text)
    consented_at: Mapped[datetime] = _created()
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_count: Mapped[int] = mapped_column(Integer, default=0)


class StudyEvent(Base):
    __tablename__ = "study_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("study_participants.id", ondelete="CASCADE"))
    review_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("reviews.id", ondelete="SET NULL"))
    condition: Mapped[str | None] = mapped_column(Text)
    event: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = _created()


class StudyDecision(Base):
    __tablename__ = "study_decisions"
    id: Mapped[uuid.UUID] = _uuid()
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("study_participants.id", ondelete="CASCADE"))
    review_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("reviews.id", ondelete="SET NULL"), unique=True)
    trial_index: Mapped[int] = mapped_column(Integer)
    condition: Mapped[str] = mapped_column(Text)
    decision: Mapped[str] = mapped_column(Text)
    reasons: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    reason_other: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[int] = mapped_column(SmallInteger)
    shown_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime] = _created()
    time_on_page_ms: Mapped[int] = mapped_column(Integer)
    similar_count: Mapped[int | None] = mapped_column(Integer)
    new_outfit_count: Mapped[int | None] = mapped_column(Integer)


class StudyFollowup(Base):
    __tablename__ = "study_followups"
    id: Mapped[uuid.UUID] = _uuid()
    decision_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("study_decisions.id", ondelete="CASCADE"), unique=True)
    bought: Mapped[str] = mapped_column(Text)
    still_want: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = _created()


class StudyTaskTimer(Base):
    __tablename__ = "study_task_timers"
    id: Mapped[uuid.UUID] = _uuid()
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("study_participants.id", ondelete="CASCADE"))
    task: Mapped[str] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed: Mapped[bool | None] = mapped_column(Boolean)


class AccountTombstone(Base):
    __tablename__ = "account_tombstones"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
