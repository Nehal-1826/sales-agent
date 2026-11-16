# Stream D — Demo Data + Natural AI Guide

Date: 2026-11-14
Status: owner requested ("add mock data for demo and our ai assistant should guide user… natural not generic")
Base: `merge/agent-foundation` (post-C10)

## Problem

1. Demo mode (backend down) shows thin data: agent-side mocks exist (mockData.ts) but the four
   Warmup tabs (Overview/DNS/Reports/Reputation) show only an offline panel — Stream B's
   "no mock for warmup" decision, now reversed by owner.
2. The AI guide in demo mode returns ONE static canned string (DEMO_GUIDE) — the "generic"
   experience the owner rejects. The live guide (core/guide.py) is already contextual
   (KB + live workspace state + executable suggestions) — its persona can be warmer, but the
   real gap is demo.

## Decisions

- **Demo data everywhere**: warmupApi gets demo-mode fallbacks (inDemo()) with rich seeded-shape
  datasets (mailboxes w/ warmth history, today stats, placement split, alerts, activity, DNS
  results, report metrics, reputation overview/trend/bounce-spam). Warmup offline panel becomes
  "Demo data" mode when in demo (badge: DEMO, clearly not live). Existing agent-side mockData
  enriched where thin (leads/replies/tasks/drafts already rich — verify, fill gaps).
- **Demo guide = local intent router** (no API key needed): frontend demo-only module with a
  natural-language knowledge set — intent patterns (e.g. "warm up|mailbox", "find leads",
  "approve|draft", "dns", "billing|plan", "whatsapp", "warmup score", page-specific "what is
  this page") → answers written in the SAME natural voice as the live guide, referencing the
  demo data the user is seeing ("your three demo mailboxes…", numbers from the demo dataset).
  Page-aware: GuideWidget passes current route; unmatched questions get a graceful
  best-effort answer + top-3 suggestion chips. NO "I'm a demo" hedging on every line — one
  subtle badge in the panel header instead.
- **Live guide polish (small)**: core/guide.py persona pass — warmer opener variety, reference
  concrete live numbers, keep executable-suggestion behavior; no structural change.

## Tasks (est.)

- **D1**: warmup demo datasets + warmupApi demo fallbacks + DEMO badge in warmup tabs.
- **D2**: demo guide intent router (knowledge set + suggestion chips + page-awareness), replaces
  static DEMO_GUIDE.
- **D3**: live-guide persona polish in core/guide.py (+ its tests stay green).
- **D4**: gate — E2E demo-mode pass (kill backends → full click-through incl. warmup tabs + guide
  Q&A) + normal gate.

## Constraints

As before: branch-local, no push, strict TS, tokens only, servers stay up for owner between
runs. No parallel implementers with Stream C — D dispatches after C closes.
