"""Downloadable lead-import templates and .eml template import."""
from __future__ import annotations

import csv
import io
from email.message import EmailMessage

import pytest
from fastapi import HTTPException

from app.services import crm_service
from app.services.crm_template_service import MAX_EML_BYTES, parse_eml


# --------------------------------------------------------------------------- #
# import templates                                                             #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("source", ["csv", "linkedin"])
def test_template_is_valid_csv_with_a_sample_row(source: str) -> None:
    rows = list(csv.reader(io.StringIO(crm_service.build_import_template(source))))
    assert rows, "template must not be empty"
    assert rows[0] == crm_service.IMPORT_TEMPLATE_COLUMNS[source]
    assert len(rows) > 1, "a sample row shows the user what to type"


def test_generic_template_columns_match_what_the_parser_reads() -> None:
    """The whole point of generating the file: it cannot drift from the parser.

    _lead_fields_from_row reads these exact keys for a generic CSV.
    """
    header = crm_service.IMPORT_TEMPLATE_COLUMNS["csv"]
    norm = {h: "x" for h in header}
    fields = crm_service._lead_fields_from_row(norm, linkedin=False)
    assert fields["name"] == "x"
    assert fields["email"] == "x"
    assert fields["company"] == "x"
    assert fields["title"] == "x"
    assert fields["phone"] == "x"


def test_linkedin_template_columns_match_what_the_parser_reads() -> None:
    header = crm_service.IMPORT_TEMPLATE_COLUMNS["linkedin"]
    # The parser lowercases headers before lookup, as DictReader rows are
    # normalised in import_leads_csv.
    norm = {h.lower(): "x" for h in header}
    fields = crm_service._lead_fields_from_row(norm, linkedin=True)
    assert fields["name"] == "x x"          # First + Last
    assert fields["email"] == "x"           # Email Address
    assert fields["company"] == "x"
    assert fields["title"] == "x"           # Position
    assert fields["source"] == "linkedin"


def test_template_round_trips_through_the_real_parser() -> None:
    """Fill the template in and the importer must read every row back."""
    text = crm_service.build_import_template("csv")
    rows = list(csv.DictReader(io.StringIO(text)))
    assert rows
    for row in rows:
        norm = {k.strip().lower(): v for k, v in row.items()}
        fields = crm_service._lead_fields_from_row(norm, linkedin=False)
        # import_leads_csv skips a row only when BOTH are blank.
        assert fields["name"] or fields["email"]


def test_unknown_source_falls_back_to_generic() -> None:
    assert crm_service.build_import_template("nonsense").splitlines()[0] == \
        ",".join(crm_service.IMPORT_TEMPLATE_COLUMNS["csv"])


# --------------------------------------------------------------------------- #
# .eml import                                                                  #
# --------------------------------------------------------------------------- #


def _eml(*, subject: str = "Invitation", html: str | None = None,
         text: str | None = "plain body") -> bytes:
    m = EmailMessage()
    m["Subject"] = subject
    m["From"] = "sender@example.com"
    m["To"] = "lead@example.com"
    m.set_content(text or "")
    if html:
        m.add_alternative(html, subtype="html")
    return m.as_bytes()


def test_prefers_the_html_part() -> None:
    """HTML is what the recipient sees, so it wins over the plain fallback."""
    out = parse_eml(_eml(html="<h1>Hello</h1>", text="plain body"))
    assert out["subject"] == "Invitation"
    assert "<h1>Hello</h1>" in out["body"]
    assert "plain body" not in out["body"]


def test_falls_back_to_plain_text_when_there_is_no_html() -> None:
    out = parse_eml(_eml(html=None, text="just text"))
    assert "just text" in out["body"]


def test_rejects_empty_file() -> None:
    with pytest.raises(HTTPException) as exc:
        parse_eml(b"")
    assert exc.value.status_code == 400


def test_rejects_oversized_file() -> None:
    with pytest.raises(HTTPException) as exc:
        parse_eml(b"x" * (MAX_EML_BYTES + 1))
    assert exc.value.status_code == 413


def test_rejects_a_file_with_no_readable_body() -> None:
    """A .eml carrying only an attachment has nothing to become a template."""
    m = EmailMessage()
    m["Subject"] = "Only an attachment"
    m.set_content("")
    m.add_attachment(b"\x00\x01", maintype="application", subtype="octet-stream",
                     filename="blob.bin")
    with pytest.raises(HTTPException) as exc:
        parse_eml(m.as_bytes())
    assert exc.value.status_code == 400


def test_missing_subject_does_not_crash() -> None:
    m = EmailMessage()
    m.set_content("body only")
    out = parse_eml(m.as_bytes())
    assert out["subject"] == ""
    assert "body only" in out["body"]


def test_mislabelled_charset_still_imports() -> None:
    """A slightly malformed export must not hard-fail the upload."""
    raw = (
        b"Subject: Broken charset\r\n"
        b"Content-Type: text/plain; charset=definitely-not-a-charset\r\n\r\n"
        b"caf\xc3\xa9 body\r\n"
    )
    out = parse_eml(raw)
    assert "body" in out["body"]
