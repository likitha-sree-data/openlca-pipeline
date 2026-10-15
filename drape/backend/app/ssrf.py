"""Fetch a product page or image without letting the server be used to reach
internal addresses (SSRF).

Rules:
  * only http and https, only ports 80 and 443, no credentials in the URL
  * the host is resolved once per hop and every address must be public
    (no private, loopback, link-local, CGNAT, multicast, reserved or unspecified)
  * the connection goes to the address that was checked, with the original
    Host header and TLS server name, so a second DNS answer cannot redirect it
    (DNS rebinding)
  * redirects are followed by hand, at most 3, and every hop is checked again
  * short timeouts, a size cap while streaming, and no proxy from the environment
"""
from __future__ import annotations

import html
import ipaddress
import re
import socket
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

MAX_REDIRECTS = 3
TIMEOUT = httpx.Timeout(5.0, connect=4.0)
PAGE_CAP = 2 * 1024 * 1024
IMAGE_CAP = 12 * 1024 * 1024
UA = "Mozilla/5.0 (compatible; DrapeReview/1.0; +https://github.com)"
CGNAT = ipaddress.ip_network("100.64.0.0/10")

Resolver = Callable[[str, int], list[str]]


class FetchBlocked(Exception):
    """The address is not allowed. The message is safe to show."""


class FetchFailed(Exception):
    """The site could not be read. The message is safe to show."""


def default_resolver(host: str, port: int) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise FetchFailed("That web address could not be found. Check the link.") from exc
    return list(dict.fromkeys(i[4][0] for i in infos))


def is_public(ip: str) -> bool:
    addr = ipaddress.ip_address(ip.split("%")[0])
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    if isinstance(addr, ipaddress.IPv6Address) and addr.sixtofour:
        return is_public(str(addr.sixtofour))
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_reserved
                or addr.is_unspecified or (isinstance(addr, ipaddress.IPv4Address) and addr in CGNAT)
                or (isinstance(addr, ipaddress.IPv6Address) and addr.is_site_local))


def check_url(url: str) -> tuple[str, str, int]:
    parts = urlsplit(url.strip())
    if parts.scheme not in ("http", "https"):
        raise FetchBlocked("Only http and https links can be checked.")
    if parts.username or parts.password:
        raise FetchBlocked("Links with a username or password are not allowed.")
    host = (parts.hostname or "").rstrip(".").lower()
    if not host:
        raise FetchBlocked("That link has no web address.")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port not in (80, 443):
        raise FetchBlocked("Links to unusual ports are not allowed.")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise FetchBlocked("That address is private, so Drape will not open it.")
    return parts.scheme, host, port


@dataclass
class Fetched:
    url: str
    content: bytes
    content_type: str


def safe_fetch(url: str, cap: int = PAGE_CAP, resolver: Resolver = default_resolver,
               transport: httpx.BaseTransport | None = None, accept: str = "text/html,image/*;q=0.9,*/*;q=0.5") -> Fetched:
    current = url
    with httpx.Client(timeout=TIMEOUT, follow_redirects=False, trust_env=False, transport=transport,
                      headers={"User-Agent": UA, "Accept": accept}) as client:
        for _ in range(MAX_REDIRECTS + 1):
            scheme, host, port = check_url(current)
            try:
                literal = ipaddress.ip_address(host.strip("[]"))
                addrs = [str(literal)]
            except ValueError:
                addrs = resolver(host, port)
            if not addrs or not all(is_public(a) for a in addrs):
                raise FetchBlocked("That address is private, so Drape will not open it.")
            ip = addrs[0]
            parts = urlsplit(current)
            netloc_ip = f"[{ip}]" if ":" in ip else ip
            if parts.port:
                netloc_ip += f":{parts.port}"
            pinned = urlunsplit((scheme, netloc_ip, parts.path or "/", parts.query, ""))
            ext = {"sni_hostname": host} if scheme == "https" else {}
            try:
                with client.stream("GET", pinned, headers={"Host": parts.netloc.split("@")[-1]}, extensions=ext) as resp:
                    if resp.status_code in (301, 302, 303, 307, 308):
                        loc = resp.headers.get("location")
                        if not loc:
                            raise FetchFailed("The site sent a broken redirect.")
                        current = urljoin(current, loc)
                        continue
                    if resp.status_code in (401, 403, 429, 503):
                        raise FetchFailed("This shop blocks automatic checks. Add a screenshot or photo of the item instead.")
                    if resp.status_code >= 400:
                        raise FetchFailed(f"The page answered with status {resp.status_code}. Add a screenshot or photo instead.")
                    declared = resp.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > cap:
                        raise FetchFailed("That page is too large to check. Add a screenshot or photo instead.")
                    buf = bytearray()
                    for chunk in resp.iter_bytes():
                        buf.extend(chunk)
                        if len(buf) > cap:
                            raise FetchFailed("That page is too large to check. Add a screenshot or photo instead.")
                    return Fetched(current, bytes(buf), resp.headers.get("content-type", "").split(";")[0].strip().lower())
            except httpx.TimeoutException as exc:
                raise FetchFailed("The site took too long to answer. Add a screenshot or photo instead.") from exc
            except httpx.HTTPError as exc:
                raise FetchFailed("The site could not be reached. Add a screenshot or photo instead.") from exc
        raise FetchFailed("The link redirected too many times. Add a screenshot or photo instead.")


# ---------------------------------------------------------------- Open Graph

_META = re.compile(r"<meta\b[^>]*>", re.I | re.S)
_ATTR = re.compile(r'([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))')
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def parse_product(page: bytes, base_url: str) -> dict[str, str | None]:
    text = page.decode("utf-8", errors="replace")
    meta: dict[str, str] = {}
    for tag in _META.findall(text):
        attrs = {m[0].lower(): html.unescape(m[2] or m[3] or m[4] or "") for m in _ATTR.findall(tag)}
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        if key and "content" in attrs and key not in meta:
            meta[key] = attrs["content"].strip()
    title = meta.get("og:title") or meta.get("twitter:title")
    if not title:
        m = _TITLE.search(text)
        title = html.unescape(m.group(1)).strip() if m else None
    image = meta.get("og:image:secure_url") or meta.get("og:image") or meta.get("twitter:image")
    price = meta.get("product:price:amount") or meta.get("og:price:amount")
    currency = meta.get("product:price:currency") or meta.get("og:price:currency")
    return {
        "title": re.sub(r"\s+", " ", title)[:120] if title else None,
        "image": urljoin(base_url, image) if image else None,
        "price": price if price and re.fullmatch(r"\d+([.,]\d{1,2})?", price) else None,
        "currency": currency[:3].upper() if currency else None,
    }
