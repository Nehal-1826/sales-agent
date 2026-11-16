/**
 * First-login product tour — the 6-step walkthrough card (components/Tutor.tsx).
 *
 * State is two-layered so the tour opens exactly once per user and never
 * comes back uninvited:
 *   - localStorage 'agentic-ai:tour-done' — instant, works in demo mode and
 *     before the first API call answers.
 *   - server flag User.onboarding['tour_done'] (GET/PATCH /api/onboarding/)
 *     — per-user, survives a different browser. Both are set together on
 *     Finish or Skip tour.
 */

import { attempt, inDemo, request } from './transport';
import type { PageKey } from './types';

export const TOUR_DONE_KEY = 'agentic-ai:tour-done';
export const RESUME_TOUR_EVENT = 'agentic:resume-tour';

/** Where a step's "Show me" button navigates (#/page or #/page/sub). */
export interface TourTarget {
  page: PageKey;
  sub?: string;
}

export interface TourStep {
  key: string;
  title: string;
  /** 2-3 sentences, same voice as the in-app guide. */
  body: string;
  /** When set, the step offers "Show me" — navigate + advance. */
  showMe?: TourTarget;
}

export const TOUR_STEPS: TourStep[] = [
  {
    key: 'welcome',
    title: 'Welcome to WarmPulse',
    body: "We warm your mailboxes so they land in the inbox, find businesses that fit your ideal client, and draft the outreach emails for you. Nothing sends until you approve it — you stay in control of every message. This quick tour shows you where everything lives.",
  },
  {
    key: 'mail',
    title: 'Read and send from Mail',
    body: 'Mail is a full inbox for every address you connected — folders, search, replies and compose. Prospects who answer show up right here. Try it: open Mail and send a note from one of your own addresses.',
    showMe: { page: 'mail' },
  },
  {
    key: 'mailboxes',
    title: 'Connect your mailboxes',
    body: 'Settings → Mailboxes & speed is where sending addresses live. The wizard connects Gmail, Zoho or Outlook in a few clicks, and Test Connection checks the login before anything is saved. Daily send limits and warmup pace are tuned here too.',
    showMe: { page: 'settings', sub: 'mailboxes' },
  },
  {
    key: 'targeting',
    title: 'Tell us who to find',
    body: 'Under Who to find you set the industries and countries to search — "dental clinics in the US", "SaaS startups in Germany". Change it any time; the very next cycle follows the new targeting. Saved profiles let you switch focus with one click.',
    showMe: { page: 'settings', sub: 'targeting' },
  },
  {
    key: 'approvals',
    title: 'Approvals: you have the final word',
    body: 'Every drafted email waits in Approvals — read it, edit it, then Approve & send. Approved mail is queued and sent gradually inside your sending window, never as one blast. Reject anything you dislike; the next cycle writes a better one.',
    showMe: { page: 'approvals' },
  },
  {
    key: 'autopilot',
    title: 'Flip on Autopilot',
    body: 'Autopilot runs the whole loop on a schedule — discover, vet, draft — while you do other things. Turn it on under Schedule & reports, where the daily report email lands at 20:00. Until then, every run starts with your click.',
    showMe: { page: 'settings', sub: 'schedule' },
  },
];

/* ------------------------------------------------------------------ */
/* Local flag                                                          */
/* ------------------------------------------------------------------ */

export function tourDoneLocally(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTourDoneLocally(done: boolean): void {
  try {
    if (done) localStorage.setItem(TOUR_DONE_KEY, '1');
    else localStorage.removeItem(TOUR_DONE_KEY);
  } catch {
    /* storage unavailable — the server flag still applies */
  }
}

/* ------------------------------------------------------------------ */
/* Server flag (same endpoint as the setup wizard state)               */
/* ------------------------------------------------------------------ */

/** True when the SERVER says this user finished/skipped the tour. */
export async function tourDoneOnServer(): Promise<boolean> {
  if (await inDemo()) return false; // demo mode has no per-user state
  try {
    const state = await request<{ tourDone?: boolean }>('/onboarding/');
    return state.tourDone === true;
  } catch {
    return false; // server hiccup must not trap the user in tour-less limbo
  }
}

/** Persist done/skipped server-side; best-effort, never blocks the UI. */
export async function setTourDoneOnServer(done: boolean): Promise<void> {
  if (await inDemo()) return;
  await attempt(() =>
    request<{ tourDone: boolean }>('/onboarding/', {
      method: 'PATCH',
      body: JSON.stringify({ tourDone: done }),
    }),
  );
}

/** Ask a mounted Tutor to reopen at the last unfinished step. */
export function resumeTour(): void {
  window.dispatchEvent(new Event(RESUME_TOUR_EVENT));
}
