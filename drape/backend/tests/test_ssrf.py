import httpx
import pytest

from app.ssrf import FetchBlocked, FetchFailed, is_public, parse_product, safe_fetch

PUBLIC = "93.184.216.34"


def resolver_for(mapping):
    calls = []

    def resolve(host, port):
        calls.append(host)
        value = mapping[host]
        return value(len(calls)) if callable(value) else value

    resolve.calls = calls
    return resolve


def transport(handler):
    seen = []

    def wrapped(request):
        seen.append(request)
        return handler(request)

    t = httpx.MockTransport(wrapped)
    t.seen = seen
    return t


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/", "http://10.0.0.5/x", "http://192.168.1.1/", "http://172.16.0.1/", "http://169.254.169.254/latest/meta-data",
    "http://[::1]/", "http://[fe80::1]/", "http://0.0.0.0/", "http://100.64.0.1/", "http://[::ffff:127.0.0.1]/", "http://localhost/",
    "http://printer.local/", "ftp://example.com/x", "file:///etc/passwd", "http://user:pw@example.com/", "http://example.com:8080/",
    "gopher://example.com/",
])
def test_blocked_urls(url):
    with pytest.raises(FetchBlocked):
        safe_fetch(url, resolver=resolver_for({"example.com": [PUBLIC]}), transport=transport(lambda r: httpx.Response(200)))


def test_hostname_resolving_to_private_is_blocked():
    with pytest.raises(FetchBlocked):
        safe_fetch("https://evil.example/", resolver=resolver_for({"evil.example": ["10.1.2.3"]}),
                   transport=transport(lambda r: httpx.Response(200)))
    with pytest.raises(FetchBlocked):  # any private address among the answers blocks it
        safe_fetch("https://mixed.example/", resolver=resolver_for({"mixed.example": [PUBLIC, "127.0.0.1"]}),
                   transport=transport(lambda r: httpx.Response(200)))


def test_redirect_to_localhost_is_blocked():
    t = transport(lambda r: httpx.Response(302, headers={"location": "http://localhost:80/admin"}))
    with pytest.raises(FetchBlocked):
        safe_fetch("https://shop.example/item", resolver=resolver_for({"shop.example": [PUBLIC]}), transport=t)
    t2 = transport(lambda r: httpx.Response(302, headers={"location": "http://127.0.0.1/"}))
    with pytest.raises(FetchBlocked):
        safe_fetch("https://shop.example/item", resolver=resolver_for({"shop.example": [PUBLIC]}), transport=t2)
    # redirect to a name that resolves privately
    t3 = transport(lambda r: httpx.Response(301, headers={"location": "https://internal.example/"}))
    with pytest.raises(FetchBlocked):
        safe_fetch("https://shop.example/item", resolver=resolver_for({"shop.example": [PUBLIC], "internal.example": ["192.168.0.2"]}), transport=t3)


def test_dns_rebinding_connects_to_checked_address():
    # First answer is public, any later answer is private. The request must go to the
    # address that was checked, not to a fresh lookup.
    resolve = resolver_for({"rebind.example": lambda n: [PUBLIC] if n == 1 else ["127.0.0.1"]})
    t = transport(lambda r: httpx.Response(200, html="<html></html>"))
    got = safe_fetch("https://rebind.example/page", resolver=resolve, transport=t)
    assert got.content == b"<html></html>"
    assert len(resolve.calls) == 1
    req = t.seen[0]
    assert req.url.host == PUBLIC
    assert req.headers["host"] == "rebind.example"
    assert req.extensions.get("sni_hostname") == "rebind.example"


def test_redirect_hops_are_limited_and_rechecked():
    t = transport(lambda r: httpx.Response(302, headers={"location": "/again"}))
    with pytest.raises(FetchFailed):
        safe_fetch("https://loop.example/", resolver=resolver_for({"loop.example": [PUBLIC]}), transport=t)
    assert len(t.seen) == 4


def test_size_cap_and_blocking_shop():
    big = transport(lambda r: httpx.Response(200, content=b"x" * 5000))
    with pytest.raises(FetchFailed):
        safe_fetch("https://big.example/", cap=1000, resolver=resolver_for({"big.example": [PUBLIC]}), transport=big)
    blocked = transport(lambda r: httpx.Response(403))
    with pytest.raises(FetchFailed, match="screenshot"):
        safe_fetch("https://shop.example/", resolver=resolver_for({"shop.example": [PUBLIC]}), transport=blocked)


def test_timeout_is_reported():
    def slow(r):
        raise httpx.ReadTimeout("slow", request=r)

    with pytest.raises(FetchFailed, match="too long"):
        safe_fetch("https://slow.example/", resolver=resolver_for({"slow.example": [PUBLIC]}), transport=transport(slow))


def test_is_public():
    assert is_public(PUBLIC) and is_public("2606:4700:4700::1111")
    assert not is_public("::ffff:10.0.0.1")
    assert not is_public("2002:7f00:0001::")  # 6to4 of 127.0.0.1


def test_parse_open_graph():
    page = b"""<html><head><title>Fallback</title>
      <meta property="og:title" content="Navy knit sweater &amp; more">
      <meta content="/img/sweater.jpg" property="og:image">
      <meta property="product:price:amount" content="65.00">
      <meta property="product:price:currency" content="eur"></head></html>"""
    p = parse_product(page, "https://shop.example/p/1")
    assert p == {"title": "Navy knit sweater & more", "image": "https://shop.example/img/sweater.jpg", "price": "65.00", "currency": "EUR"}
    assert parse_product(b"<title> Plain  page </title>", "https://x.example/")["title"] == "Plain page"
