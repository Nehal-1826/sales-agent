"""Tests for client-mailbox Gmail-API engagement (network mocked).

Covers ``services/warmup/gmail_engagement``:
  - label ensure (find existing / create missing) — gmail.labels
  - message search query construction + id extraction
  - message metadata parsing (From header + label ids)
  - modify no-op skip + add/remove payload — gmail.modify
  - 403 → GmailScopeError (needs-reconnect signal), never leaks the token
  - action planning (rescue-from-spam vs plain open, always mark read)
"""
from __future__ import annotations

import pytest

from app.services.warmup import gmail_engagement as ge
from app.services.warmup.gmail_engagement import GmailScopeError


class _Resp:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _RoutingClient:
    """Fake httpx.AsyncClient routing (method, path) → canned _Resp.

    ``routes`` maps a ``"GET /labels"``-style key (matched by suffix on the
    request path) to a ``_Resp``. Records every call in ``calls``.
    """

    calls: list[dict] = []

    def __init__(self, routes: dict) -> None:
        self._routes = routes

    def __call__(self, *a, **k):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def _match(self, method: str, url: str) -> _Resp:
        for key, resp in self._routes.items():
            m, _, suffix = key.partition(" ")
            if m == method and url.endswith(suffix.split("?")[0]):
                return resp
        raise AssertionError(f"no route for {method} {url}")

    async def get(self, url, **kwargs):
        type(self).calls.append({"method": "GET", "url": url, **kwargs})
        return self._match("GET", url)

    async def post(self, url, **kwargs):
        type(self).calls.append({"method": "POST", "url": url, **kwargs})
        return self._match("POST", url)


def _install(monkeypatch, routes: dict) -> type[_RoutingClient]:
    _RoutingClient.calls = []
    monkeypatch.setattr(ge.httpx, "AsyncClient", _RoutingClient(routes))
    return _RoutingClient


# --------------------------------------------------------------------------- #
# ensure_warmup_label                                                          #
# --------------------------------------------------------------------------- #


async def test_ensure_label_returns_existing(monkeypatch) -> None:
    client = _install(
        monkeypatch,
        {"GET /labels": _Resp(200, {"labels": [
            {"id": "Label_9", "name": "WarmPulse"},
            {"id": "Label_1", "name": "Work"},
        ]})},
    )
    label_id = await ge.ensure_warmup_label("tok")
    assert label_id == "Label_9"
    # No create POST when the label already exists.
    assert all(c["method"] != "POST" for c in client.calls)


async def test_ensure_label_creates_when_missing(monkeypatch) -> None:
    _install(
        monkeypatch,
        {
            "GET /labels": _Resp(200, {"labels": [{"id": "L1", "name": "Work"}]}),
            "POST /labels": _Resp(200, {"id": "Label_new"}),
        },
    )
    label_id = await ge.ensure_warmup_label("tok")
    assert label_id == "Label_new"


# --------------------------------------------------------------------------- #
# search + metadata                                                            #
# --------------------------------------------------------------------------- #


async def test_list_message_ids_builds_query_and_returns_ids(monkeypatch) -> None:
    client = _install(
        monkeypatch,
        {"GET /messages": _Resp(200, {"messages": [{"id": "m1"}, {"id": "m2"}]})},
    )
    ids = await ge.list_warmup_message_ids("tok", ["peer@x.io", "peer2@y.io"])
    assert ids == ["m1", "m2"]
    q = client.calls[0]["params"]["q"]
    assert "from:peer@x.io" in q and "from:peer2@y.io" in q
    assert "in:anywhere" in q
    assert "-label:WarmPulse" in q


async def test_list_message_ids_empty_senders_short_circuits(monkeypatch) -> None:
    # No senders → no HTTP call at all.
    monkeypatch.setattr(ge.httpx, "AsyncClient", _RoutingClient({}))
    assert await ge.list_warmup_message_ids("tok", []) == []


async def test_get_message_meta_parses_from_and_labels(monkeypatch) -> None:
    _install(
        monkeypatch,
        {"GET /messages/m1": _Resp(200, {
            "id": "m1",
            "labelIds": ["SPAM", "UNREAD"],
            "payload": {"headers": [
                {"name": "From", "value": "Peer <peer@x.io>"},
                {"name": "Subject", "value": "hi"},
            ]},
        })},
    )
    meta = await ge.get_message_meta("tok", "m1")
    assert meta["from"] == "Peer <peer@x.io>"
    assert meta["label_ids"] == ["SPAM", "UNREAD"]


# --------------------------------------------------------------------------- #
# modify                                                                       #
# --------------------------------------------------------------------------- #


async def test_modify_noop_skips_http(monkeypatch) -> None:
    monkeypatch.setattr(ge.httpx, "AsyncClient", _RoutingClient({}))
    await ge.modify_message("tok", "m1", add=[], remove=[])  # must not raise / call


async def test_modify_posts_add_and_remove(monkeypatch) -> None:
    client = _install(
        monkeypatch,
        {"POST /messages/m1/modify": _Resp(200, {"id": "m1"})},
    )
    await ge.modify_message("tok", "m1", add=["Label_9", "INBOX"], remove=["SPAM", "UNREAD"])
    body = client.calls[0]["json"]
    assert body == {"addLabelIds": ["Label_9", "INBOX"], "removeLabelIds": ["SPAM", "UNREAD"]}


# --------------------------------------------------------------------------- #
# error handling                                                              #
# --------------------------------------------------------------------------- #


async def test_403_raises_scope_error_without_token(monkeypatch) -> None:
    _install(
        monkeypatch,
        {"GET /labels": _Resp(403, {"error": {"message": "insufficient permission"}})},
    )
    with pytest.raises(GmailScopeError) as exc:
        await ge.ensure_warmup_label("super-secret-access-token")
    assert "super-secret-access-token" not in str(exc.value)


async def test_500_raises_runtime_not_scope(monkeypatch) -> None:
    _install(monkeypatch, {"GET /labels": _Resp(500, {"error": {"message": "boom"}})})
    with pytest.raises(RuntimeError) as exc:
        await ge.ensure_warmup_label("tok")
    assert not isinstance(exc.value, GmailScopeError)


# --------------------------------------------------------------------------- #
# action planning (pure)                                                       #
# --------------------------------------------------------------------------- #


def test_plan_actions_rescues_spam_and_marks_read() -> None:
    from app.db.models.warmup_logs import WarmupAction
    from app.tasks.client_engagement import _plan_actions

    add, remove, primary = _plan_actions(["SPAM", "UNREAD"])
    assert ge.WARMUP_LABEL_NAME in add and "INBOX" in add
    assert "SPAM" in remove and "UNREAD" in remove
    assert primary == WarmupAction.spam_rescued


def test_plan_actions_inbox_unread_is_open() -> None:
    from app.db.models.warmup_logs import WarmupAction
    from app.tasks.client_engagement import _plan_actions

    add, remove, primary = _plan_actions(["INBOX", "UNREAD"])
    assert "INBOX" not in remove and "SPAM" not in remove
    assert "UNREAD" in remove
    assert primary == WarmupAction.opened
