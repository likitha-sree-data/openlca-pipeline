import uuid
from types import SimpleNamespace

import pytest

from app.llm.anthropic import AnthropicProvider


def demo(client):
    return {"Authorization": f"Bearer {client.post('/api/demo/start').json()['access_token']}"}


def ids_in(client, h):
    return {g["id"]: g["name"] for g in client.get("/api/garments", headers=h).json()["items"]}


@pytest.mark.parametrize("question,expect", [
    ("What can I wear to work?", "For work, try your"),
    ("Do I own anything green?", "Yes. In green you have"),
    ("What haven't I worn lately?", "Not worn lately:"),
    ("What goes with my olive cardigan?", "Your olive cardigan goes well with"),
])
def test_rule_based_examples(client, question, expect):
    h = demo(client)
    owned = ids_in(client, h)
    r = client.post("/api/chat", json={"message": question}, headers=h)
    assert r.status_code == 200, r.text
    reply = r.json()["reply"]
    assert reply["content"].startswith(expect), reply["content"]
    for g in reply["garments"]:
        assert g["id"] in owned
    if reply["outfit"]:
        for p in reply["outfit"]["pieces"]:
            assert p["garment_id"] in owned and p["garment"]["name"] == owned[p["garment_id"]]
    if "olive cardigan" in question:
        assert any(p["garment"]["name"] == "Olive cardigan" for p in reply["outfit"]["pieces"])
    if "green" in question:
        names = {g["name"] for g in reply["garments"]}
        assert {"Olive cardigan", "Green midi dress"} <= names


def test_off_topic_and_history_and_clear(client):
    h = demo(client)
    r = client.post("/api/chat", json={"message": "Tell me a joke about taxes"}, headers=h).json()
    assert "questions about your clothes" in r["reply"]["content"]
    hist = client.get("/api/chat", headers=h).json()
    assert [m["role"] for m in hist] == ["user", "assistant"]
    assert client.delete("/api/chat", headers=h).status_code == 204
    assert client.get("/api/chat", headers=h).json() == []


def test_daily_cap(client, monkeypatch):
    from app.config import get_settings

    h = demo(client)
    monkeypatch.setattr(get_settings(), "chat_daily_cap", 2)
    assert client.post("/api/chat", json={"message": "what can I wear"}, headers=h).status_code == 200
    assert client.post("/api/chat", json={"message": "what can I wear"}, headers=h).status_code == 200
    r = client.post("/api/chat", json={"message": "what can I wear"}, headers=h)
    assert r.status_code == 429 and "limit" in r.json()["detail"]


def test_per_minute_rate_limit(client):
    h = demo(client)
    codes = [client.post("/api/chat", json={"message": "hi"}, headers=h).status_code for _ in range(12)]
    assert codes.count(200) == 10 and codes[-1] == 429


class FakeLLM:
    """Pretends to be a model that calls tools, then tries to sneak in an invented garment id."""

    name = "fake"
    can_chat = True
    can_read_labels = False

    def __init__(self, invented: str):
        self.invented = invented

    def chat(self, messages, tools, system="", execute=None):
        assert "photo" not in str(messages).lower() or True
        found = execute("search_garments", {"text": "cardigan"})
        outfits = execute("generate_outfits", {"occasion": "work", "with_garment_id": found[0]["id"]})
        # a bad id passed to a tool is refused, never rendered
        execute("generate_outfits", {"with_garment_id": self.invented})
        return {"text": f"Try your {found[0]['name']} ({self.invented}) and your Purple velvet cape.", "tool_calls": [outfits]}


def test_llm_path_never_returns_unknown_ids(client, monkeypatch):
    h = demo(client)
    owned = ids_in(client, h)
    invented = str(uuid.uuid4())
    monkeypatch.setattr("app.routers.chat.get_provider", lambda: FakeLLM(invented))
    r = client.post("/api/chat", json={"message": "What goes with a cardigan for work?"}, headers=h).json()
    reply = r["reply"]
    assert r["provider"] == "fake"
    assert invented not in reply["content"]
    all_ids = [g["id"] for g in reply["garments"]] + [p["garment_id"] for p in (reply["outfit"] or {"pieces": []})["pieces"]]
    assert all_ids and all(i in owned for i in all_ids)
    # stored history renders only owned ids too
    for m in client.get("/api/chat", headers=h).json():
        for g in m["garments"]:
            assert g["id"] in owned


def test_llm_failure_falls_back_to_rules(client, monkeypatch):
    h = demo(client)

    class Broken:
        name, can_chat, can_read_labels = "broken", True, False

        def chat(self, *a, **k):
            raise RuntimeError("network down")

    monkeypatch.setattr("app.routers.chat.get_provider", lambda: Broken())
    r = client.post("/api/chat", json={"message": "What can I wear to work?"}, headers=h).json()
    assert r["provider"] == "rules" and r["reply"]["content"].startswith("For work")


def test_anthropic_provider_tool_loop_with_fake_client():
    calls = []

    def block(**kw):
        b = SimpleNamespace(**kw)
        b.model_dump = lambda exclude_none=True: {k: v for k, v in kw.items()}
        return b

    responses = [
        SimpleNamespace(stop_reason="tool_use", content=[block(type="tool_use", id="t1", name="search_garments", input={"color": "green"})]),
        SimpleNamespace(stop_reason="end_turn", content=[block(type="text", text="You own an olive cardigan.")]),
    ]

    class Msgs:
        def create(self, **kw):
            calls.append(kw)
            return responses.pop(0)

    fake = SimpleNamespace(beta=SimpleNamespace(messages=Msgs()))
    p = AnthropicProvider("key", "", client=fake)
    out = p.chat([{"role": "user", "content": "green?"}], [{"name": "search_garments", "description": "d", "parameters": {"type": "object"}}],
                 system="sys", execute=lambda n, a: [{"id": "x", "name": "Olive cardigan"}])
    assert out["text"] == "You own an olive cardigan."
    assert calls[0]["model"] == "claude-opus-5-5"
    assert calls[0]["betas"] == ["server-side-fallback-2026-07-01"] and calls[0]["extra_body"] == {"fallbacks": "default"}
    tool_result = calls[1]["messages"][-1]["content"][0]
    assert tool_result["type"] == "tool_result" and tool_result["tool_use_id"] == "t1"


def test_anthropic_refusal_is_handled():
    resp = SimpleNamespace(stop_reason="refusal", content=[])
    fake = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: resp)))
    out = AnthropicProvider("k", "", client=fake).chat([{"role": "user", "content": "x"}], [], execute=lambda n, a: None)
    assert "clothes" in out["text"]
