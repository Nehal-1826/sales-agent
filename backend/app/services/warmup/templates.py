"""Bundled plain warmup templates + fake-name fixtures.

These are the fallback content source when the LLM generator is unavailable
(or when a mailbox is on content mode 'A'/'D'). Wave 4 will replace most
usage with live LLM output — see content.py.

Placeholders supported in ``body`` / ``subject``:
    {sender_first_name}, {recipient_first_name}, {company}

Each template is 2-4 sentences, deliberately low-signal conversational text.
No marketing language, no CTAs, no links — those are all classic spam triggers
during warmup.
"""
from __future__ import annotations

SUBJECT_PREFIXES: list[str] = ["Re:", "Fwd:", ""]

# Plaintext first names used when callers don't supply real ones (e.g. new peer
# pairs with no thread history yet).
FAKE_FIRST_NAMES: list[str] = [
    "Alex", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Riley",
    "Jamie", "Avery", "Cameron", "Quinn", "Drew", "Robin", "Parker",
    "Kai", "Sasha", "Devin", "Hayden", "Reese", "Emerson",
]

# Neutral-sounding faux-company names used for {company} placeholder.
FAKE_COMPANIES: list[str] = [
    "Northwind", "Contoso", "Fabrikam", "Acme", "Globex",
    "Initech", "Umbrella", "Vandelay", "Wayne", "Pied Piper",
    "Hooli", "Stark", "Wonka", "Tyrell", "Cyberdyne",
    "Soylent", "Massive Dynamic", "Pierce & Pierce", "Oscorp", "Prestige Worldwide",
]

# 20 plain templates covering the required topic mix. Tone: casual colleague.
TEMPLATES: list[dict[str, str]] = [
    # --- meeting follow-up (3) ---
    {
        "topic": "meeting_follow_up",
        "subject": "quick note from yesterday",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Thanks for the call yesterday. I jotted down the action items "
            "on my side and will circle back once I've got a draft ready.\n\n"
            "Cheers,\n{sender_first_name}"
        ),
    },
    {
        "topic": "meeting_follow_up",
        "subject": "follow-up from our chat",
        "body": (
            "Hey {recipient_first_name},\n\n"
            "Good talking earlier. Let me know if you want me to loop in "
            "anyone else from {company} before we move forward.\n\n"
            "{sender_first_name}"
        ),
    },
    {
        "topic": "meeting_follow_up",
        "subject": "thanks for today",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Appreciated the time today. I'll have the notes typed up by "
            "tomorrow and share them when they're ready.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- project check-in (3) ---
    {
        "topic": "project_check_in",
        "subject": "checking in",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Just wanted to see how things are tracking on your end. No "
            "pressure on a reply — whenever you get a moment is fine.\n\n"
            "{sender_first_name}"
        ),
    },
    {
        "topic": "project_check_in",
        "subject": "status on your side?",
        "body": (
            "Hey {recipient_first_name},\n\n"
            "How's everything going with the {company} piece? Happy to jump "
            "on a quick call if it's easier than typing it out.\n\n"
            "{sender_first_name}"
        ),
    },
    {
        "topic": "project_check_in",
        "subject": "where are we",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Trying to get a sense of where things stand so I can plan the "
            "week. A one-liner is plenty — don't let this eat your morning.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- quick question (2) ---
    {
        "topic": "quick_question",
        "subject": "quick question",
        "body": (
            "Hey {recipient_first_name},\n\n"
            "Do you happen to know who owns the onboarding flow over at "
            "{company}? Trying not to ping the wrong person.\n\n"
            "Thanks,\n{sender_first_name}"
        ),
    },
    {
        "topic": "quick_question",
        "subject": "one quick thing",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Got a sec? Wanted to run one small thing by you before I "
            "commit to it. No rush at all.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- intro (2) ---
    {
        "topic": "intro",
        "subject": "saying hi",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "I'm {sender_first_name} — just joined the team working with "
            "{company}. Wanted to introduce myself before we end up on a "
            "thread together cold.\n\n"
            "{sender_first_name}"
        ),
    },
    {
        "topic": "intro",
        "subject": "brief intro",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Figured I'd drop you a line so my name isn't a stranger next "
            "time it shows up in your inbox. Hope the week's going well.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- status update (2) ---
    {
        "topic": "status_update",
        "subject": "weekly update",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Nothing blocking on my side this week — things are moving "
            "along. I'll flag it if that changes.\n\n"
            "{sender_first_name}"
        ),
    },
    {
        "topic": "status_update",
        "subject": "small update",
        "body": (
            "Hey {recipient_first_name},\n\n"
            "Quick one: finished the first pass earlier today. Going to sit "
            "with it for a day then come back to polish.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- small talk (2) ---
    {
        "topic": "small_talk",
        "subject": "how's the week",
        "body": (
            "Hey {recipient_first_name},\n\n"
            "How's the week shaping up on your end? It's been one of those "
            "weeks here — lots of little fires, nothing serious.\n\n"
            "{sender_first_name}"
        ),
    },
    {
        "topic": "small_talk",
        "subject": "random thought",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Totally random — were you the one who mentioned that podcast "
            "last month? Been trying to remember the name of it.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- quick favor (2) ---
    {
        "topic": "quick_favor",
        "subject": "small favor?",
        "body": (
            "Hey {recipient_first_name},\n\n"
            "Mind taking a look at the draft when you have a minute? Just "
            "want another pair of eyes on it before I send it along.\n\n"
            "Thanks,\n{sender_first_name}"
        ),
    },
    {
        "topic": "quick_favor",
        "subject": "could you check",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Could you sanity-check the numbers for the {company} piece "
            "whenever it's convenient? Nothing urgent.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- context sharing (1) ---
    {
        "topic": "context_sharing",
        "subject": "some background",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Wanted to share a bit of context before our next sync so we "
            "don't spend the first ten minutes catching up. I'll send the "
            "highlights tomorrow.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- thank-you (2) ---
    {
        "topic": "thank_you",
        "subject": "thanks",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Just a quick thanks for the help earlier. Saved me a real "
            "headache this afternoon.\n\n"
            "{sender_first_name}"
        ),
    },
    {
        "topic": "thank_you",
        "subject": "appreciate it",
        "body": (
            "Hey {recipient_first_name},\n\n"
            "Really appreciated you jumping in on short notice. Owe you "
            "one.\n\n"
            "{sender_first_name}"
        ),
    },

    # --- reschedule (1) ---
    {
        "topic": "reschedule",
        "subject": "reschedule?",
        "body": (
            "Hi {recipient_first_name},\n\n"
            "Something came up on my end — any chance we could push our "
            "chat to later in the week? Totally flexible on my side.\n\n"
            "{sender_first_name}"
        ),
    },
]


# Simple single-color HTML shell for mode 'B'. Callers substitute ``{body_html}``
# (newline-to-<br> converted plaintext) and ``{sender_first_name}`` in signature.
HTML_SHELL = """\
<!DOCTYPE html>
<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="background:#2563eb;color:#fff;padding:12px 20px;font-size:14px;">
    A quick note
  </div>
  <div style="padding:20px;max-width:560px;margin:0 auto;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:20px;line-height:1.5;font-size:14px;">
      {body_html}
    </div>
    <div style="color:#6b7280;font-size:12px;margin-top:16px;">
      {sender_first_name}
    </div>
  </div>
</body></html>
"""
