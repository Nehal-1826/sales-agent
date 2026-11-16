"""Logo upload for CRM email templates.

Covers the validation rules, the {{logo}} substitution, and the deliberate
decision that the serving endpoint is unauthenticated — a recipient's mail
client fetches that URL with no session, and Gmail strips base64 data: URIs,
so there is no authenticated or inline alternative that actually renders.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.services import crm_template_service as svc


class _Tpl:
    """Minimal stand-in for a CrmEmailTemplate row."""

    def __init__(self, *, logo: bytes | None = None) -> None:
        self.id = uuid.uuid4()
        self.logo_image = logo
        self.logo_mime = "image/png" if logo else None


class _Lead:
    name = "Ada Lovelace"
    email = "ada@example.com"
    company = "Analytical Engines"
    title = "Engineer"


# --------------------------------------------------------------------------- #
# validation                                                                   #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "mime", ["image/png", "image/jpeg", "image/webp", "image/gif"]
)
def test_accepts_supported_image_types(mime: str) -> None:
    assert svc.validate_logo(content_type=mime, data=b"x" * 10) == mime


def test_normalises_mime_with_charset_suffix() -> None:
    assert (
        svc.validate_logo(content_type="image/PNG; charset=binary", data=b"x")
        == "image/png"
    )


def test_rejects_non_image() -> None:
    with pytest.raises(HTTPException) as exc:
        svc.validate_logo(content_type="application/pdf", data=b"x")
    assert exc.value.status_code == 415


def test_rejects_svg() -> None:
    """SVG can carry script — it must not be accepted for a public URL."""
    with pytest.raises(HTTPException) as exc:
        svc.validate_logo(content_type="image/svg+xml", data=b"<svg/>")
    assert exc.value.status_code == 415


def test_rejects_empty_file() -> None:
    with pytest.raises(HTTPException) as exc:
        svc.validate_logo(content_type="image/png", data=b"")
    assert exc.value.status_code == 400


def test_rejects_oversized_file() -> None:
    with pytest.raises(HTTPException) as exc:
        svc.validate_logo(
            content_type="image/png", data=b"x" * (svc.MAX_LOGO_BYTES + 1)
        )
    assert exc.value.status_code == 413


def test_accepts_file_exactly_at_the_cap() -> None:
    """Boundary: the cap is inclusive, so exactly-at-limit must pass."""
    assert (
        svc.validate_logo(content_type="image/png", data=b"x" * svc.MAX_LOGO_BYTES)
        == "image/png"
    )


# --------------------------------------------------------------------------- #
# public URL + {{logo}} rendering                                              #
# --------------------------------------------------------------------------- #


def test_public_url_is_absolute() -> None:
    """Mail clients have no relative base — the URL must be absolute."""
    tid = uuid.uuid4()
    url = svc.logo_public_url(tid, base_url="https://warmpulse.tech")
    assert url.startswith("https://warmpulse.tech/")
    assert str(tid) in url


def test_public_url_tolerates_trailing_slash_base() -> None:
    url = svc.logo_public_url(uuid.uuid4(), base_url="https://warmpulse.tech/")
    assert "//api" not in url.replace("https://", "")


def test_logo_variable_renders_an_img_tag() -> None:
    body = "Hello {{first_name}} {{logo}}"
    out = svc.render_personalization(body, lead=_Lead(), template=_Tpl(logo=b"png"))
    assert "<img src=" in out
    assert "Hello Ada" in out
    # Inline width cap: many clients ignore <style> blocks.
    assert "max-width" in out


def test_logo_variable_is_empty_without_a_logo() -> None:
    """A template with no logo must not leave a broken image in the email."""
    out = svc.render_personalization(
        "Hi {{first_name}}{{logo}}", lead=_Lead(), template=_Tpl(logo=None)
    )
    assert "<img" not in out
    assert out.strip() == "Hi Ada"


def test_logo_variable_is_empty_without_a_template() -> None:
    """Existing callers pass no template — {{logo}} must degrade, not crash."""
    out = svc.render_personalization("Hi {{first_name}}{{logo}}", lead=_Lead())
    assert "<img" not in out


def test_other_variables_still_render() -> None:
    """Regression: adding {{logo}} must not disturb the existing map."""
    out = svc.render_personalization(
        "{{first_name}} at {{company}}", lead=_Lead()
    )
    assert out == "Ada at Analytical Engines"


# --------------------------------------------------------------------------- #
# body size cap                                                                #
# --------------------------------------------------------------------------- #


def test_body_cap_fits_a_real_html_email() -> None:
    """A branded HTML email must be accepted.

    The cap used to be 4000 characters, which rejected any real template with
    422 "String should have at most 4000 characters" and made the
    "Upload .html / .txt" button useless for anything but plain text. A modest
    branded invitation is 8-10KB.
    """
    from app.schemas.crm import MAX_BODY_CHARS, CrmTemplateCreate

    html = (
        "<!DOCTYPE html><html><body>"
        + '<table style="background:#eef2f7;padding:40px 16px;"><tr><td>row</td></tr></table>' * 120
        + "</body></html>"
    )
    assert len(html) > 4000, "fixture must exceed the OLD cap to be meaningful"

    tpl = CrmTemplateCreate(name="IJRN", subject="Invitation", body=html)
    assert tpl.body == html
    assert MAX_BODY_CHARS >= 100_000


def test_template_and_step_share_the_same_cap() -> None:
    """Picking a template copies its body into a step.

    If the step cap were lower, a template that saved fine would fail the
    moment someone used it — so the two must not drift apart.
    """
    import app.schemas.crm as crm

    template_field = crm.CrmTemplateCreate.model_fields["body"]
    step_field = crm.SequenceStepCreate.model_fields["body"]

    def _max_len(field: object) -> int | None:
        for meta in getattr(field, "metadata", []):
            if hasattr(meta, "max_length"):
                return meta.max_length
        return None

    assert _max_len(template_field) == _max_len(step_field)
