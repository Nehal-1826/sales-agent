/** Small display helpers for the Mail page. */

import { fmtDateTime, fmtDayTick, fmtTime } from '../../lib/format';

/** Avatar initials from an email local part ("devesh.b@x" → "DB"). */
export function initials(email: string): string {
  const head = email.split('@')[0] ?? '?';
  const parts = head.split(/[._+-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
  return head.slice(0, 2).toUpperCase() || '?';
}

/** List-column time: clock for today, "26 Nov" this year, else with year.
 *  WHICH of the three is about the day; HOW each reads is the person's format. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(d);
  return fmtDayTick(d, d.getFullYear() !== now.getFullYear());
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Compose body is plain text but the API takes body_html — paragraphs + <br>. */
export function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim() !== '')
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** "Re: " prefix that never stacks ("Re: Re: x" stays "Re: x"). */
export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}

/** Quoted original for replies, appended below the cursor. */
export function replyQuote(from: string, date: string, text: string): string {
  const clip = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  return `\n\n---- On ${fmtDateTime(date, 'medium')}, ${from} wrote ----\n${clip}`;
}
