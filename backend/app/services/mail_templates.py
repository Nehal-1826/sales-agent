"""Branded HTML email templates for transactional mail.

One shared shell renders every notification with consistent branding —
WarmPulse logo, accent gradient, glass card body, footer with helpful
links. Individual templates only fill in:

* a one-line headline ("You connected a mailbox")
* an optional paragraph of context
* an optional list of key→value detail rows ("Provider: gmail")
* an optional CTA button (label + URL)

Email clients are conservative renderers — no flexbox, no grid, table-
based layout, all CSS inlined. We deliberately don't ship a separate
plain-text template; the ``plain_text_fallback`` helper produces a
matching text body from the same fields so plain readers see the same
content.

Layout invariants (so every email reads as the same product):
* Card edge sits 28 px from card content on every side
* Brand header aligns flush with the card's left edge (0 px gutter)
* Vertical rhythm: 14, 18, 24 px — 24 between major sections
* Detail rows: 12 px row padding, label left, value right (mono font)
* CTA button: 12×24 padding, sits 24 px below the body
"""
from __future__ import annotations

from datetime import UTC, datetime


# --------------------------------------------------------------------------- #
# Brand tokens — match the in-app palette so an email next to the
# dashboard reads as the same product.                                       #
# --------------------------------------------------------------------------- #

BG = "#0a0a0f"
SURFACE = "#12121a"
SURFACE_2 = "#1a1a26"
BORDER = "#2a2a3a"
HAIRLINE = "#222232"
TEXT = "#e8e8f0"
TEXT_DIM = "#8888a0"
ACCENT = "#00e5a0"
ACCENT_2 = "#00c4ff"

LANDING = "https://warmpulse.tech"
APP = "https://warmpulse.tech/app"

# Card width — narrow enough to read on a phone in portrait, wide enough
# to render two-column detail rows without wrapping.
CARD_WIDTH = 560


def _now_utc() -> str:
    return datetime.now(UTC).strftime("%-d %b %Y at %H:%M UTC")


def render(
    *,
    headline: str,
    intro: str | None = None,
    detail_rows: dict[str, str] | None = None,
    cta_label: str | None = None,
    cta_url: str | None = None,
    footer_note: str | None = None,
) -> tuple[str, str]:
    html = _render_html(
        headline=headline,
        intro=intro,
        detail_rows=detail_rows or {},
        cta_label=cta_label,
        cta_url=cta_url,
        footer_note=footer_note,
    )
    text = _render_plain(
        headline=headline,
        intro=intro,
        detail_rows=detail_rows or {},
        cta_label=cta_label,
        cta_url=cta_url,
        footer_note=footer_note,
    )
    return text, html


# --------------------------------------------------------------------------- #
# Plain-text fallback                                                          #
# --------------------------------------------------------------------------- #


def _render_plain(
    *,
    headline: str,
    intro: str | None,
    detail_rows: dict[str, str],
    cta_label: str | None,
    cta_url: str | None,
    footer_note: str | None,
) -> str:
    parts: list[str] = [headline, "=" * min(60, len(headline)), ""]
    if intro:
        parts += [intro, ""]
    if detail_rows:
        for k, v in detail_rows.items():
            parts.append(f"  {k}: {v}")
        parts.append("")
    if cta_label and cta_url:
        parts += [f"{cta_label} → {cta_url}", ""]
    parts.append(f"Sent {_now_utc()}")
    if footer_note:
        parts += ["", footer_note]
    parts += ["", "— The WarmPulse team · https://warmpulse.tech"]
    return "\n".join(parts)


# --------------------------------------------------------------------------- #
# HTML shell                                                                   #
# --------------------------------------------------------------------------- #


def _render_html(
    *,
    headline: str,
    intro: str | None,
    detail_rows: dict[str, str],
    cta_label: str | None,
    cta_url: str | None,
    footer_note: str | None,
) -> str:
    intro_html = (
        f'<p style="margin:0 0 24px 0;color:{TEXT_DIM};font-size:15px;'
        f'line-height:1.55;">{_html_escape(intro)}</p>'
        if intro
        else ""
    )

    rows_html = ""
    if detail_rows:
        items = "".join(
            f"""
                <tr>
                  <td style="padding:12px 0;color:{TEXT_DIM};font-size:13px;
                             border-top:1px solid {HAIRLINE};vertical-align:top;
                             width:42%;">{_html_escape(k)}</td>
                  <td style="padding:12px 0;color:{TEXT};font-size:13px;
                             border-top:1px solid {HAIRLINE};text-align:right;
                             vertical-align:top;
                             font-family:'JetBrains Mono',Menlo,monospace;">
                    {_html_escape(v)}
                  </td>
                </tr>"""
            for k, v in detail_rows.items()
        )
        rows_html = f"""
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="margin:0 0 24px 0;background:{SURFACE_2};
                      border:1px solid {BORDER};border-radius:10px;">
          <tr>
            <td style="padding:0 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tbody>{items}</tbody>
              </table>
            </td>
          </tr>
        </table>"""

    cta_html = ""
    if cta_label and cta_url:
        cta_html = f"""
        <table role="presentation" cellspacing="0" cellpadding="0"
               style="margin:0 0 24px 0;">
          <tr>
            <td style="border-radius:10px;background:{ACCENT};
                       box-shadow:0 4px 14px rgba(0,229,160,0.25);">
              <a href="{_html_escape(cta_url)}" target="_blank"
                 style="display:inline-block;color:#0a0a0f;
                        text-decoration:none;font-weight:600;font-size:14px;
                        line-height:1;letter-spacing:0.01em;
                        padding:13px 22px;border-radius:10px;">
                {_html_escape(cta_label)}
              </a>
            </td>
          </tr>
        </table>"""

    footer_note_html = (
        f'<p style="margin:24px 0 0 0;color:{TEXT_DIM};font-size:12px;'
        f'line-height:1.6;">{_html_escape(footer_note)}</p>'
        if footer_note
        else ""
    )

    # Brand header — flush with the card's left edge (0 padding L/R) so
    # the logo + WarmPulse text align with the card's content column.
    # The card itself uses 28 px L/R padding internally; the header sits
    # directly above with no horizontal gutter, mirroring the in-app
    # sidebar where the brand mark aligns to the same x as nav items.
    return f"""<!doctype html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>{_html_escape(headline)}</title>
</head>
<body style="margin:0;padding:0;background:{BG};
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,
                         Helvetica,Arial,sans-serif;color:{TEXT};
             -webkit-font-smoothing:antialiased;">

  <!-- Hidden preheader so the inbox preview shows the headline before
       the user opens the message. -->
  <div style="display:none !important;visibility:hidden;mso-hide:all;
              font-size:1px;line-height:1px;max-height:0;max-width:0;
              opacity:0;overflow:hidden;">
    {_html_escape(headline)}
  </div>

  <!-- Outer wrapper: gradient corona at the top so dark-mode clients
       still get that "warm" feel from the brand. -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
         style="background:radial-gradient(ellipse 600px 400px at top center,
                {ACCENT}14 0%, transparent 70%), {BG};">
    <tr>
      <td align="center" style="padding:36px 16px 16px 16px;">

        <table role="presentation" width="{CARD_WIDTH}" cellspacing="0" cellpadding="0"
               style="max-width:{CARD_WIDTH}px;width:100%;margin:0 auto;">

          <!-- Brand header: 0 padding L/R so the logo aligns flush with
               the card's left edge below. -->
          <tr>
            <td style="padding:0 0 24px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle;line-height:0;">
                    <svg width="34" height="34" viewBox="0 0 64 64"
                         xmlns="http://www.w3.org/2000/svg" style="display:block;">
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="64" y2="64"
                                        gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stop-color="{ACCENT}"/>
                          <stop offset="100%" stop-color="{ACCENT_2}"/>
                        </linearGradient>
                      </defs>
                      <rect x="14" y="20" width="36" height="24" rx="3"
                            fill="none" stroke="url(#g)" stroke-width="2.5"/>
                      <path d="M14 22 L32 34 L50 22"
                            stroke="url(#g)" stroke-width="2.5" fill="none"
                            stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M8 50 L20 50 L24 44 L30 56 L36 42 L42 52 L46 50 L56 50"
                            stroke="url(#g)" stroke-width="2.5" fill="none"
                            stroke-linecap="round" stroke-linejoin="round"/>
                      <circle cx="32" cy="49" r="2.4" fill="{ACCENT}"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;color:{TEXT};
                             font-size:18px;font-weight:600;letter-spacing:-0.01em;">
                    WarmPulse
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:{SURFACE};border:1px solid {BORDER};
                       border-radius:14px;padding:28px;
                       box-shadow:0 4px 24px rgba(0,0,0,0.4);">

              <h1 style="margin:0 0 14px 0;color:{TEXT};font-size:22px;
                         font-weight:600;letter-spacing:-0.012em;
                         line-height:1.3;">
                {_html_escape(headline)}
              </h1>
              {intro_html}
              {rows_html}
              {cta_html}

              <!-- Hairline above the timestamp groups it with the footer
                   visually instead of hugging the CTA. -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-top:1px solid {HAIRLINE};padding-top:18px;">
                    <p style="margin:0;color:{TEXT_DIM};font-size:12px;
                              line-height:1.55;">
                      Sent {_now_utc()}
                    </p>
                    {footer_note_html}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer (outside the card so it reads as meta, not content) -->
          <tr>
            <td style="padding:24px 4px 36px 4px;color:{TEXT_DIM};
                       font-size:12px;line-height:1.6;text-align:center;">
              <a href="{LANDING}" style="color:{TEXT_DIM};text-decoration:none;">warmpulse.tech</a>
              &nbsp;·&nbsp;
              <a href="{APP}" style="color:{TEXT_DIM};text-decoration:none;">Open the app</a>
              &nbsp;·&nbsp;
              <a href="mailto:support@warmpulse.tech" style="color:{TEXT_DIM};text-decoration:none;">support@warmpulse.tech</a>
              <div style="margin-top:10px;color:{TEXT_DIM}99;">
                You're receiving this because of activity on your WarmPulse account.
              </div>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>"""


def _html_escape(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
