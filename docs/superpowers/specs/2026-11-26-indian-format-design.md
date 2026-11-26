# Indian format by default, changeable anytime — design

**Status:** approved by the owner on 2026-11-26 ("ok"), together with the
sibling design `2026-11-26-roles-design.md`. Built after it.

## What the owner asked for

"Everything to be in Indian format (in start) but they can change anytime —
need for both superadmin and user."

## Today (from a full inventory of the code, 2026-11-26)

- **No single place formats anything.** 28 date calls and 40 number calls
  follow the visitor's **browser** locale (so the default today is whatever
  the browser is set to, not Indian); one is hard-coded `en-GB`. Nine named
  date helpers, four relative-time helpers with different wording and four
  clock helpers are hand-written and ignore any setting.
- **Money is drawn four ways in the console:** `money()` in `lib/platform.ts`
  (Indian grouping for ₹, Western for $), a literal `$` in 7 places, `usd()`
  in Analytics (always US style), and the payment's own currency on the
  Payments and Invoices tabs.
- **Documents are a mix:** the Django invoice says `Rs. 2,999.00` (Western
  grouping) with dates like `26 Nov 2026` in UTC; the warmup service's invoice
  PDF says `₹499.00`; the daily report says `26 Nov 20:00 – 27 Nov 20:00 IST`.
- **No preference exists on an account.** `GET /api/auth/me/` carries none.
- Members never see the Settings page (its sidebar entry is owner/admin only).
- The old warmup frontend had a complete "Region & Format" system that was
  never ported — a reference for the shape, nothing more.

## Decisions (the owner's)

- The Indian default uses the **12-hour clock** (2:05 PM).
- People can switch between **India, United States, UK and "Match my
  device"**.
- **E-mails and invoices are always Indian**, for everyone.

## The choice (per person)

Saved on the account — one account covers both the console and the workspace
app — so it follows the person from one screen to the other.

| Choice | Values | Default |
|---|---|---|
| **Format** | India · United States · UK · Match my device | **India**, for every existing and new account |
| **Clock** | 12-hour (2:05 PM) · 24-hour (14:05) | **12-hour** |

| Format | Short date | Medium date | Numbers |
|---|---|---|---|
| India | 26/11/2026 | 26 Nov 2026 | 1,00,000 |
| United States | 11/26/2026 | Nov 26, 2026 | 100,000 |
| UK | 26/11/2026 | 26 Nov 2026 | 100,000 |
| Match my device | whatever the browser uses | | |

The sign of a money amount follows the money (₹ for rupees, $ for dollars);
only its grouping follows the format. The clock applies to every time of day
shown on a screen. Times on screens stay in the device's time zone.

Server: `User.format` (`IN` | `US` | `GB` | `device`) and `User.clock`
(`12h` | `24h`). `GET /api/auth/me/` adds `preferences {format, clock}`;
`PUT /api/auth/preferences/` changes either or both (signed-in, OTP
satisfied; an unknown value is a 400). It is the person's own setting, so it
is refused inside "Enter as user" with the other personal routes.

## Screens: one formatter

`frontend/src/lib/format.ts` becomes the one place:

- `setPreferences(...)` (called when the profile loads and after a save) and
  `useFormat()`, which re-renders the screen when the choice changes — a
  change applies at once, without a reload.
- `fmtDate(d, 'short' | 'medium')`, `fmtDateTime(d)`, `fmtTime(d)`,
  `fmtNumber(n, {digits})`, `fmtMoney(minor, currency)`, `fmtPercent(n,
  digits)`.

Rules for the sweep:

- Every `Intl` date and number call, every hand-written date, clock and
  money helper, and every literal `₹` or `$` on a screen goes through it;
  the old helpers are deleted, not left beside it (`when` ×4, `shortDate`,
  `fullDate`, `sendTimeLabel`, `clock`, `hourLabel` ×2, `fmtDate` ×2,
  `formatDayTick`, `money`, `usd`, `nf`; the four relative-time helpers
  become one `timeAgo`).
- Charts' axes and tooltips use it.
- **Inputs stay as they are:** hours typed as 24-hour text ("09:00"),
  date pickers, and the sending-hours fields.
- Decimal points in scores and percentages do not change (they are the same
  in every format).
- Exports made in the browser (CSV) keep ISO dates in their cells — they are
  read by other software.
- The public pricing page is unchanged (it already leads with ₹).

## Where the choice is changed

One small **Format** card (two selectors and Save):

- in the **console's Settings** page, and in the **workspace app's Settings →
  Account**;
- and, because Members never see Settings, a **Format** button beside the
  person's name at the bottom of the sidebar in **both** apps, opening the
  same card in a dialog. Every role, both apps.

## Documents: always Indian, for everyone

No choice here: a document goes to whoever reads it, often more than one
person.

- **Django** — one module, `core/formatting.py`: dates `26/11/2026`, dates
  and times `26/11/2026, 2:05 PM IST`, money `₹2,999.00` with Indian
  grouping (`$39.00` for dollar amounts). Used by the invoice (the tenant's
  and the console's copy), the daily report and its preview (labels and
  subject), the replies digest, the weekly wrong-address digest, and the
  chat's "goes out at about …" line.
- **Warmup service** — its invoice PDF (₹ with Indian grouping, `26/11/2026`),
  its receipt and renewal mails, its admin report summaries, and its
  "Generated" stamps in Indian time. Dollar amounts in its mails stay `$`.

## Tests

- Server: both fields default to India and 12-hour; the profile carries them;
  the endpoint validates and saves; refused inside "Enter as user"; the
  invoice renders `₹2,999.00`, `26/11/2026` and Indian time; the report labels.
- Warmup service: the grouping and date helpers.
- App: the type-check; and in the browser gate — a known date on a page reads
  `26/11/2026` and `2:05 PM` under India, `11/26/2026` after switching to the
  United States; the choice survives a reload; a Member can open the dialog
  from the sidebar.
- **A guard so new code cannot bypass it:** the browser gate fails if any
  date or number is formatted without the shared formatter (a search for bare
  `toLocaleDateString`, `toLocaleString`, `toLocaleTimeString` and
  `Intl.NumberFormat` outside `lib/format.ts`).

## Not changed

The language, the currency a plan or payment is in, the time zone on screens,
exported data cells, phone numbers and addresses (free text), the public
pricing page.

## Build

After the roles piece. Its own commit. It touches the warmup service, so that
container is rebuilt with the deploy.
