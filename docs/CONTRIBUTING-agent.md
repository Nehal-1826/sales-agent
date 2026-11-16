# Contributing — version control rules

These rules exist because two people pushing straight to `master` caused
real merge conflicts (UI theme, scraper rotation, migrations). Follow them
and merges stay boring.

## Branch workflow (the important part)

1. **Never commit directly to `master`.** Branch per piece of work:
   ```bash
   git checkout master && git pull --rebase origin master
   git checkout -b feat/lead-targeting     # or fix/..., docs/..., chore/...
   ```
2. Commit early and often on your branch.
3. Before opening a PR, replay your work on the latest master:
   ```bash
   git fetch origin && git rebase origin/master
   ```
4. Open a PR. CI must be green (backend tests + frontend typecheck/build).
5. Merge only after review. Delete the branch after merging.

## Django migration conflicts

Model changes create numbered migrations — two branches often create the
same-numbered migration. That is **normal**; resolve it with:

```bash
cd backend
python manage.py makemigrations --merge   # creates a 00XX_merge migration
python manage.py migrate
```

Commit the merge migration together with your change. Never hand-edit an
already-pushed migration.

## Line endings

`.gitattributes` normalizes everything to LF. If git warns about
"CRLF will be replaced by LF", that's expected on Windows — commit anyway.

## Secrets

- API keys, SMTP passwords, tokens live **only** in the database (Settings
  page) or `.env` (git-ignored). Never in code, never in commits.
- If a secret ever lands in a commit: rotate it immediately, then clean history.

## Before you open a PR — run the checks

```bash
# backend (Windows venv paths; use bin/ on macOS/Linux)
cd backend
export DATABASE_URL=sqlite:///db.sqlite3
.venv/Scripts/python manage.py migrate     # must apply clean
.venv/Scripts/python manage.py test        # must pass

# frontend — tsc strict + vite build
npm run build
```

## Commit messages

One line, imperative, say *what and why*:
`Lead targeting by country — restrict discovery sweep to user-picked regions`
