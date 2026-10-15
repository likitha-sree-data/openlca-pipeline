"""Private file storage with expiring signed URLs.

Drivers:
  local     files on disk, URLs signed with HMAC and served by /media
  supabase  Supabase Storage REST API with the service role key
Paths are always "<user_id>/..." inside a bucket, so ownership is in the path.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import time
import urllib.parse
from functools import lru_cache
from pathlib import Path

import httpx

from .config import get_settings

BUCKETS = ("garments", "outfit-photos", "review-items", "profile-photos")


class StorageError(RuntimeError):
    pass


def _check(bucket: str, path: str) -> None:
    if bucket not in BUCKETS:
        raise StorageError(f"Unknown bucket {bucket}")
    if ".." in path or path.startswith("/"):
        raise StorageError("Invalid path")


class LocalStorage:
    def __init__(self, root: str, secret: str, ttl: int) -> None:
        self.root = Path(root)
        self.secret = secret.encode()
        self.ttl = ttl

    def _file(self, bucket: str, path: str) -> Path:
        _check(bucket, path)
        return self.root / bucket / path

    def put(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        f = self._file(bucket, path)
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)

    def get(self, bucket: str, path: str) -> bytes:
        f = self._file(bucket, path)
        if not f.exists():
            raise StorageError("Not found")
        return f.read_bytes()

    def exists(self, bucket: str, path: str) -> bool:
        return self._file(bucket, path).exists()

    def delete(self, bucket: str, paths: list[str]) -> None:
        for p in paths:
            f = self._file(bucket, p)
            if f.exists():
                f.unlink()

    def delete_prefix(self, bucket: str, prefix: str) -> None:
        d = self._file(bucket, prefix)
        if d.is_dir():
            for f in sorted(d.rglob("*"), reverse=True):
                f.unlink() if f.is_file() else f.rmdir()
            d.rmdir()

    def list_prefix(self, bucket: str, prefix: str) -> list[str]:
        d = self._file(bucket, prefix)
        if not d.is_dir():
            return []
        base = self.root / bucket
        return [str(f.relative_to(base)) for f in d.rglob("*") if f.is_file()]

    def sign(self, bucket: str, path: str) -> str:
        exp = int(time.time()) + self.ttl
        token = self.signature(bucket, path, exp)
        return f"/media/{bucket}/{urllib.parse.quote(path)}?exp={exp}&sig={token}"

    def signature(self, bucket: str, path: str, exp: int) -> str:
        msg = f"{bucket}/{path}:{exp}".encode()
        return base64.urlsafe_b64encode(hmac.new(self.secret, msg, hashlib.sha256).digest()).decode().rstrip("=")

    def verify(self, bucket: str, path: str, exp: int, sig: str) -> bool:
        if exp < time.time():
            return False
        return hmac.compare_digest(self.signature(bucket, path, exp), sig)


class SupabaseStorage:
    def __init__(self, url: str, key: str, ttl: int, transport: httpx.BaseTransport | None = None) -> None:
        self.base = url.rstrip("/") + "/storage/v1"
        self.headers = {"Authorization": f"Bearer {key}", "apikey": key}
        self.ttl = ttl
        self.client = httpx.Client(timeout=20, transport=transport)

    def put(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        _check(bucket, path)
        r = self.client.post(f"{self.base}/object/{bucket}/{path}", content=data,
                             headers={**self.headers, "Content-Type": content_type, "x-upsert": "true"})
        if r.status_code >= 300:
            raise StorageError(f"Upload failed with status {r.status_code}")

    def get(self, bucket: str, path: str) -> bytes:
        _check(bucket, path)
        r = self.client.get(f"{self.base}/object/{bucket}/{path}", headers=self.headers)
        if r.status_code >= 300:
            raise StorageError("Not found")
        return r.content

    def exists(self, bucket: str, path: str) -> bool:
        _check(bucket, path)
        r = self.client.head(f"{self.base}/object/{bucket}/{path}", headers=self.headers)
        return r.status_code < 300

    def delete(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        for p in paths:
            _check(bucket, p)
        r = self.client.request("DELETE", f"{self.base}/object/{bucket}", json={"prefixes": paths}, headers=self.headers)
        if r.status_code >= 300:
            raise StorageError(f"Delete failed with status {r.status_code}")

    def list_prefix(self, bucket: str, prefix: str) -> list[str]:
        out: list[str] = []
        stack = [prefix.rstrip("/")]
        while stack:
            cur = stack.pop()
            r = self.client.post(f"{self.base}/object/list/{bucket}", json={"prefix": cur, "limit": 1000}, headers=self.headers)
            if r.status_code >= 300:
                break
            for item in r.json():
                full = f"{cur}/{item['name']}"
                if item.get("id") is None:
                    stack.append(full)
                else:
                    out.append(full)
        return out

    def delete_prefix(self, bucket: str, prefix: str) -> None:
        paths = self.list_prefix(bucket, prefix)
        for i in range(0, len(paths), 100):
            self.delete(bucket, paths[i:i + 100])

    def sign(self, bucket: str, path: str) -> str:
        _check(bucket, path)
        r = self.client.post(f"{self.base}/object/sign/{bucket}/{path}", json={"expiresIn": self.ttl}, headers=self.headers)
        if r.status_code >= 300:
            raise StorageError("Could not sign URL")
        return self.base + r.json()["signedURL"]


Storage = LocalStorage | SupabaseStorage


@lru_cache
def get_storage() -> Storage:
    s = get_settings()
    if s.storage_driver == "supabase":
        return SupabaseStorage(s.supabase_url, s.supabase_service_role_key, s.signed_url_ttl)
    return LocalStorage(s.local_storage_dir, s.app_secret, s.signed_url_ttl)


def url_for(bucket: str, path: str | None) -> str | None:
    """Signed URL for a stored file, or a static URL for demo illustrations."""
    if not path:
        return None
    if path.startswith("demo:"):
        return "/demo-garments/" + path[5:]
    try:
        return get_storage().sign(bucket, path)
    except StorageError:
        return None
