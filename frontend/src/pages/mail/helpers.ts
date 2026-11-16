/** Small display helpers for the Mail page. */

/** Avatar initials from an email local part ("devesh.b@x" → "DB"). */
export function initials(email: string): string {
  const head = email.split('@')[0] ?? '?';
  const parts = head.split(/[._+-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
  return head.slice(0, 2).toUpperCase() || '?';
}

/** List-column time: clock for today, "Nov 12" this year, else with year. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    undefined,
    sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' },
  );
}

/** Reading-pane timestamp ("Nov 16, 2026, 4:05 PM"). */
export function fullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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
  return `\n\n---- On ${fullDate(date)}, ${from} wrote ----\n${clip}`;
}
