/**
 * Client-side PDF export for the warmup Reports tab (Stream C, C8).
 *
 * Everything is drawn with the plain jsPDF text/rect APIs — jspdf-autotable
 * is deliberately NOT a dependency here (the old frontend had it; this port
 * hand-rolls the table so the dep stays out). Styling is token-driven: the
 * accent/text/border colors are read from the live CSS custom properties at
 * runtime (same idea as pages/warmup/chartTheme.ts), so a palette retune
 * flows into exported PDFs without a code change.
 */
import { jsPDF } from 'jspdf';
import type {
  WarmupAnalyticsRange,
  WarmupMailboxReportRow,
} from './warmupTypes';

// --------------------------------------------------------------------------- //
// Palette — live tokens, resolved like chartTheme does                        //
// --------------------------------------------------------------------------- //

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface ReportPalette {
  accent: Rgb;
  accentStrong: Rgb;
  text: Rgb;
  text2: Rgb;
  border: Rgb;
  panel2: Rgb;
  danger: Rgb;
  warn: Rgb;
}

const FALLBACK_PALETTE: ReportPalette = {
  accent: { r: 249, g: 115, b: 22 }, // #f97316
  accentStrong: { r: 194, g: 65, b: 12 }, // #c2410c
  text: { r: 31, g: 27, b: 22 }, // #1f1b16
  text2: { r: 92, g: 86, b: 77 }, // #5c564d
  border: { r: 227, g: 223, b: 215 }, // #e3dfd7
  panel2: { r: 248, g: 247, b: 244 }, // #f8f7f4
  danger: { r: 185, g: 28, b: 28 }, // #b91c1c
  warn: { r: 161, g: 98, b: 7 }, // #a16207
};

const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

/** #rgb / #rrggbb → Rgb. Returns null for anything else. */
function parseHex(v: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) {
    return rgb(
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    );
  }
  return rgb(
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  );
}

/** "rgb(r, g, b)" / "rgba(r, g, b, a)" (what getComputedStyle normalizes to) → Rgb. */
function parseComputed(v: string): Rgb | null {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v.trim());
  if (!m) return null;
  return rgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

/**
 * Resolve one CSS token to RGB. The probe-element trick forces the browser to
 * normalize whatever format the token holds (hex, rgb(), oklch…) to a
 * computed rgb() string, which we can always parse — no hex-only assumption.
 */
function tokenRgb(name: string, fallback: Rgb): Rgb {
  if (typeof document === 'undefined') return fallback;
  try {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    probe.style.color = `var(${name}, rgb(${fallback.r}, ${fallback.g}, ${fallback.b}))`;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return parseComputed(computed) ?? parseHex(computed) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Live theme tokens for the export — call at click time, never at module load. */
export function readReportPalette(): ReportPalette {
  return {
    accent: tokenRgb('--accent', FALLBACK_PALETTE.accent),
    accentStrong: tokenRgb('--accent-strong', FALLBACK_PALETTE.accentStrong),
    text: tokenRgb('--text', FALLBACK_PALETTE.text),
    text2: tokenRgb('--text-2', FALLBACK_PALETTE.text2),
    border: tokenRgb('--border', FALLBACK_PALETTE.border),
    panel2: tokenRgb('--panel-2', FALLBACK_PALETTE.panel2),
    danger: tokenRgb('--danger', FALLBACK_PALETTE.danger),
    warn: tokenRgb('--warn', FALLBACK_PALETTE.warn),
  };
}

// --------------------------------------------------------------------------- //
// Report input                                                                 //
// --------------------------------------------------------------------------- //

/** Everything the PDF needs — the Reports tab fills this from its loaded data. */
export interface WarmupReportPdfInput {
  range: WarmupAnalyticsRange;
  /** human label for the range, e.g. "Last 30 days" */
  rangeLabel: string;
  mailboxes: number;
  activeMailboxes: number;
  meanWarmth: number;
  warmthDelta: number;
  sent: number;
  opens: number;
  replies: number;
  /** mean inbox placement over the range, percent 0-100 (null = no signal) */
  inboxPct: number | null;
  rows: WarmupMailboxReportRow[];
}

// A4 portrait in pt — same geometry the old frontend's PDF writer used.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;

export function warmupReportPdfFilename(range: WarmupAnalyticsRange): string {
  return `warmpulse-warmup-report-${range.from}_to_${range.to}.pdf`;
}

const fmtInt = (n: number): string => Math.round(n).toLocaleString();
const pct = (n: number | null): string => (n === null ? '—' : `${Math.round(n)}%`);

/** Clip `s` with an ellipsis so it fits `maxW` at the current font size. */
function fitText(doc: jsPDF, s: string, maxW: number): string {
  if (doc.getTextWidth(s) <= maxW) return s;
  const ell = '…';
  let cut = s.length;
  while (cut > 1 && doc.getTextWidth(s.slice(0, cut) + ell) > maxW) cut -= 1;
  return s.slice(0, cut) + ell;
}

// --------------------------------------------------------------------------- //
// PDF writer                                                                   //
// --------------------------------------------------------------------------- //

/** Build the report PDF (unit-testable — does NOT trigger a download). */
export function buildWarmupReportPdf(input: WarmupReportPdfInput): jsPDF {
  const p = readReportPalette();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const accent = (c: Rgb): [number, number, number] => [c.r, c.g, c.b];

  const generatedAt = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // ---- header band: accent fill + WarmPulse wordmark ----
  doc.setFillColor(...accent(p.accent));
  doc.rect(0, 0, PAGE_W, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('WarmPulse', MARGIN, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('MAILBOX WARMUP REPORT', PAGE_W - MARGIN, 32, { align: 'right' });
  doc.text(`Generated ${generatedAt}`, PAGE_W - MARGIN, 47, { align: 'right' });

  let y = 92;

  // ---- title + range line ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...accent(p.text));
  doc.text('Warmup Report', MARGIN, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...accent(p.text2));
  doc.text(
    `${input.rangeLabel} · ${input.range.from} to ${input.range.to} · ${fmtInt(
      input.mailboxes,
    )} mailboxes (${fmtInt(input.activeMailboxes)} active)`,
    MARGIN,
    y,
  );
  y += 22;

  // ---- summary KPI band (6 cells, bordered, values in accent-strong) ----
  const kpis: Array<{ label: string; value: string }> = [
    { label: 'MEAN WARMTH', value: `${Math.round(input.meanWarmth)}` },
    {
      label: 'WARMTH Δ 24H',
      value: `${input.warmthDelta >= 0 ? '+' : ''}${input.warmthDelta.toFixed(1)}`,
    },
    { label: 'SENT', value: fmtInt(input.sent) },
    { label: 'OPENS', value: fmtInt(input.opens) },
    { label: 'REPLIES', value: fmtInt(input.replies) },
    { label: 'INBOX PLACEMENT', value: pct(input.inboxPct) },
  ];
  const bandH = 52;
  const cellW = (PAGE_W - MARGIN * 2) / kpis.length;
  doc.setDrawColor(...accent(p.border));
  doc.setLineWidth(0.8);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, bandH);
  kpis.forEach((kpi, i) => {
    const cx = MARGIN + cellW * i;
    if (i > 0) doc.line(cx, y, cx, y + bandH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...accent(p.text2));
    doc.text(kpi.label, cx + 8, y + 17, { maxWidth: cellW - 14 });
    doc.setFontSize(14);
    doc.setTextColor(...accent(p.accentStrong));
    doc.text(kpi.value, cx + 8, y + 39, { maxWidth: cellW - 14 });
  });
  y += bandH + 26;

  // ---- per-mailbox table (hand-rolled: header band + zebra rows) ----
  const COLS = [
    { key: 'mailbox', label: 'Mailbox', w: 187 } as const,
    { key: 'warmth', label: 'Warmth', w: 56 } as const,
    { key: 'sent', label: 'Sent', w: 58 } as const,
    { key: 'opens', label: 'Opens', w: 58 } as const,
    { key: 'replies', label: 'Replies', w: 58 } as const,
    { key: 'inbox', label: 'Inbox %', w: 58 } as const,
  ];
  const tableW = COLS.reduce((a, c) => a + c.w, 0); // 475 → margins 40/80
  const tableX = MARGIN;
  const ROW_H = 19;

  const drawTableHead = (headY: number): number => {
    doc.setFillColor(...accent(p.accent));
    doc.rect(tableX, headY, tableW, ROW_H, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    let x = tableX;
    for (const col of COLS) {
      const align: 'left' | 'right' = col.key === 'mailbox' ? 'left' : 'right';
      doc.text(col.label, align === 'left' ? x + 8 : x + col.w - 8, headY + 13, {
        align,
      });
      x += col.w;
    }
    return headY + ROW_H;
  };

  /** Same banding as chartTheme.warmthColor: <40 danger, <70 warn, else accent. */
  const warmthColor = (score: number): Rgb =>
    score < 40 ? p.danger : score < 70 ? p.warn : p.accentStrong;

  y = drawTableHead(y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  input.rows.forEach((row, i) => {
    if (y + ROW_H > PAGE_H - MARGIN - 14) {
      doc.addPage();
      y = MARGIN + 10;
      y = drawTableHead(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
    }
    if (i % 2 === 1) {
      doc.setFillColor(...accent(p.panel2));
      doc.rect(tableX, y, tableW, ROW_H, 'F');
    }
    doc.setDrawColor(...accent(p.border));
    doc.setLineWidth(0.5);
    doc.line(tableX, y + ROW_H, tableX + tableW, y + ROW_H);

    const warmth = Math.round(row.warmth_score);
    const cells: Record<string, string> = {
      mailbox: fitText(doc, row.email_address, COLS[0].w - 16),
      warmth: String(warmth),
      sent: fmtInt(row.sent),
      opens: fmtInt(row.opens),
      replies: fmtInt(row.replies),
      inbox: pct(row.inbox_pct),
    };
    let x = tableX;
    for (const col of COLS) {
      const isMailbox = col.key === 'mailbox';
      const align: 'left' | 'right' = isMailbox ? 'left' : 'right';
      if (col.key === 'warmth') {
        doc.setTextColor(...accent(warmthColor(warmth)));
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(...accent(isMailbox ? p.text : p.text2));
        doc.setFont('helvetica', 'normal');
      }
      doc.text(cells[col.key] ?? '', align === 'left' ? x + 8 : x + col.w - 8, y + 13, {
        align,
      });
      x += col.w;
    }
    y += ROW_H;
  });

  // ---- totals row ----
  if (input.rows.length > 0) {
    if (y + ROW_H > PAGE_H - MARGIN - 14) {
      doc.addPage();
      y = MARGIN + 10;
      y = drawTableHead(y);
    }
    const totalSent = input.rows.reduce((a, r) => a + r.sent, 0);
    const totalOpens = input.rows.reduce((a, r) => a + r.opens, 0);
    const totalReplies = input.rows.reduce((a, r) => a + r.replies, 0);
    const withInbox = input.rows.filter((r) => r.inbox_pct !== null);
    const totalInbox =
      withInbox.length > 0
        ? withInbox.reduce((a, r) => a + (r.inbox_pct ?? 0), 0) / withInbox.length
        : null;
    doc.setFillColor(...accent(p.panel2));
    doc.rect(tableX, y, tableW, ROW_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...accent(p.text));
    doc.text(`Total — ${input.rows.length} mailboxes`, tableX + 8, y + 13);
    doc.text(fmtInt(totalSent), tableX + COLS[0].w + COLS[1].w + COLS[2].w - 8, y + 13, {
      align: 'right',
    });
    doc.text(fmtInt(totalOpens), tableX + COLS[0].w + COLS[1].w + COLS[2].w + COLS[3].w - 8, y + 13, {
      align: 'right',
    });
    doc.text(
      fmtInt(totalReplies),
      tableX + COLS[0].w + COLS[1].w + COLS[2].w + COLS[3].w + COLS[4].w - 8,
      y + 13,
      { align: 'right' },
    );
    doc.text(pct(totalInbox), tableX + tableW - 8, y + 13, { align: 'right' });
  }

  // ---- footer on every page: brand line + page numbers ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...accent(p.border));
    doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_H - 46, PAGE_W - MARGIN, PAGE_H - 46);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...accent(p.text2));
    doc.text(
      `WarmPulse · Warmup Report · ${input.range.from} to ${input.range.to}`,
      MARGIN,
      PAGE_H - 30,
    );
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 30, { align: 'right' });
  }

  return doc;
}

/** Build + trigger the browser download. Returns the filename used. */
export function downloadWarmupReportPdf(input: WarmupReportPdfInput): string {
  const filename = warmupReportPdfFilename(input.range);
  buildWarmupReportPdf(input).save(filename);
  return filename;
}
