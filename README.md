# Deadline Cemetery

A quiet, spooky assignment planner: paste a brief, check source-linked task candidates, and save a plan. React + Vite, Express, and atomic local JSON persistence. **The extractor is deterministic local rules, not AI.** No API credentials, paid calls, external fonts, or network services are needed at runtime.

## Run locally

Requires Node.js 22.12+ (tested with Node 24.16.0) and npm. Run commands from this directory:

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4173**. The Express server serves the built frontend and API from one origin and binds only to `127.0.0.1`. Do not expose it with a tunnel or reverse proxy; it has no authentication or user isolation.

For hot-reloading development (one server, same URL):

```sh
npm run dev
```

Optional environment variables: `PORT` (default `4173`) and `DATA_FILE` (default `data/cemetery.json`, relative to this directory). Bash example: `PORT=4180 npm start`. No AI integration is implemented; setting an API key will not enable one or trigger spending.

## Use

1. Choose **Add a brief**, name the assignment, and paste up to 20,000 characters. Nothing is auto-populated. **Load example** is an explicit opt-in and still requires review and confirmation.
2. **Find possible tasks** runs local rules. Review, edit, remove, or add candidates. Exact quotes open the original brief with the matching substring highlighted. Unsupported or ambiguous dates stay empty. Check the confirmation box to save between 1 and 50 tasks.
3. **Your rescue plan** offers the next active work first. Pick a date and daily what-if budget (5–480 minutes). Whole-task planning remains the default. Opt into **Allow split work sessions** to spread remaining work across days; preferred sessions are 5–180 minutes. **Record work** opens an honest self-reported log, not a stopwatch. Continue/blocked require a fresh positive remaining estimate; finished completes the task. Time spent never automatically subtracts progress. Estimates may grow.
4. In review or **Edit assignment**, add a course/subject, actual submission deadline, low/normal/high importance, submission instructions, and an optional HTTP(S) submission link. The submission deadline starts blank and is **never copied from extracted task dates**. Each task has an explicit optional planned date and a 5–1440 minute integer estimate (default 30). A blank task date inherits the confirmed assignment deadline, labeled in the UI. Blockers require a reason; estimates and blockers are editable in review, add-task and edit-task forms.
5. **Submission watch** shows real task-count progress and remaining effort. Finishing every task means **Checklist ready — not submitted**. Use **Mark submitted** only after actually delivering work; unfinished tasks require explicit confirmation. The server records its current ISO timestamp. Submitted assignments move to the archive and are excluded from daily planning, without deleting tasks. **Reopen assignment** restores planning eligibility.
6. Search and course filters scope assignment and task-card views, not the global rescue plan. Existing overdue/upcoming/date-less/completed filters, exact-source views, task editing, manual additions and confirmed deletion remain available under the plan.

### Planning rules and honest limits

`GET /api/plan?date=YYYY-MM-DD&minutes=120` requires a real date and integer daily budget from 5 to 480 (maximum eight hours); malformed, repeated or unknown query parameters are rejected. Effective deadline is the earlier of the task's planned date and the assignment's confirmed submission deadline (or whichever exists). A later task date never relaxes an actual submission deadline. Ranking: overdue, today, nearest future date, assignment importance, stable task ID; undated tasks come last. Selection is deterministic greedy packing, **not** an optimal knapsack or an AI prediction. Whole tasks stay whole unless explicitly splittable. Splittable tasks pack preferred sessions into one task/date row (`sessionsPlanned` contains individual minute allocations), possibly leaving a smaller remainder for a later day. It may skip a large urgent task and schedule smaller work; the skipped task stays visible. Undated tasks may be scheduled after dated work and also appear in the separate undated inventory.

Remaining minutes sum only incomplete tasks in active assignments, including blockers; scheduled/free minutes reflect the selected plan. The warning compares all overdue/due-by-selected-day effort (including blocked work) with **one day's** budget. It is a one-day capacity heuristic, not a forecast of future availability or a guarantee of finishing on time. Estimates are user judgments, not measured time. Budget preference uses browser localStorage only; plan date is not persisted. Planning spans all active courses regardless of the filters below it.

### Sessions and multi-day recovery API

- `POST /api/assignments/:id/tasks/:taskId/sessions`: `{requestId, minutes, outcome, remainingMinutes?, note?, blockedReason?}`. Reported minutes are integer 5–480, outcome is `continue`, `blocked`, or `finished`; incomplete remaining is integer 1–1440. Blocked needs a nonblank reason. Finished canonicalizes remaining to zero. Total estimate is unchanged. Continue resolves the active blocker. Reopening completed work restores an explicit positive remaining estimate or the total estimate. Sessions have server-owned IDs/timestamps. PATCH cannot replace history.
- Retry protection is per task, inside the serialized store transaction, for its **most recent 100 sessions** (the bounded retained history). Same ID and same normalized payload returns the original entry without rolling back newer progress. Changed payload returns 409. IDs evicted beyond this window are no longer protected; this is not an unlimited accounting ledger. One server/Store instance must own each data file.
- `GET /api/availability` returns seven `{weekday, minutes}` entries, Sunday=0 through Saturday=6. Before configuration minutes are `null` (unknown), not fabricated availability. `PUT /api/availability` accepts exactly seven unique weekdays with integer minutes 0–480; explicit zero persists.
- `GET /api/recovery?date=YYYY-MM-DD&horizon=14` accepts 1–30 inclusive calendar days. UTC date-only arithmetic chooses weekdays consistently across system time zones. All active assignments share each day's capacity. Hypothetical allocation never changes stored remaining work. The collapsed dashboard uses 14 days. Assessments are conditional **Fits / At risk / Does not fit / Needs information**, with missing-date/default-estimate warnings. Unknown availability relevant to pending deadlines prevents a fit verdict. A greedy packing miss is labeled **At risk**, not proof that no schedule exists; **Does not fit** requires a necessary capacity/whole-slot failure or unresolved blocked work. Beyond-horizon deadlines are explicitly unassessed, not false failures. Deadline-prefix checks preserve missed dates even when recovery work fits later. Overdue work has its own recovery actions; official deadlines never change.

### Legacy and persistence

Legacy JSON records receive read-time defaults (blank metadata, normal importance, 30-minute estimates, remaining equal to estimate for incomplete work and zero for completed work, splittable false, preferred sessions 25, unblocked, not submitted). No bulk/destructive migration is performed; source, IDs, evidence and task completion are preserved. No calendar export, fake reminders or automatic submission is implemented.

Data survives browser refresh and server restart. It lives on the server's disk, not in browser storage; all browsers pointed at this server share it. Upcoming includes today; overdue means a date strictly before the device's current local calendar day. Completion takes precedence. The displayed day refreshes every 30 seconds. Due times and time zones are not modeled.

## Extraction limits — read before trusting a plan

- English, line-based heuristic: action/deliverable keywords and bullet lines produce candidates, with a maximum of 50. It can miss tasks, include irrelevant lines, or combine multiple deliverables. It does not understand meaning or reliably distinguish a mentioned date from an actual deadline.
- Supported dates: `2026-11-18` and full English month-first dates such as `November 18, 2026`. Only dates on that task's exact source line are considered. Multiple explicit dates on a line remain unassigned for manual review.
- **Missing years are never inferred**, even if another line has a year. Numeric slash dates, relative dates, weekday dates, abbreviations, day-first dates, and unsupported formats remain unassigned. A general uncertainty note appears when no supported date is found.
- Original source quotes are preserved exactly and validated against source offsets on save. Manually added tasks have no source claim. Editing a title or date is a human decision; it does not rewrite the original evidence.
- Pasted text only. No PDF/OCR/upload, reminders, calendar sync, accounts, cloud storage, or real AI provider integration.

## Data and safety

JSON mutations are serialized within a single Node process and written to a unique same-directory temporary file before atomic rename. Run **one server process per data file**; there is no cross-process locking, transactional database, fsync durability guarantee, encryption, or automatic backup. Back up `data/cemetery.json` while the server is stopped. A malformed data file yields a JSON storage error rather than being silently overwritten. Restore a backup to recover; do not delete data you need.

The API validates assignment metadata, safe HTTP(S) submission links, effort bounds, blockers with reasons, submission confirmation, strict planning inputs, titles, dates, task counts, confirmation, source quotes, and body sizes (64 KB JSON). Errors are JSON. Cross-origin writes and non-loopback hostnames are rejected. React escapes pasted text; no raw HTML rendering. Production sends CSP, MIME-sniffing, framing, and referrer restrictions. These measures support a local tool, not a hardened public multi-user service.

## Verify

```sh
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

Node tests additionally exercise deadline inheritance/overrides, deterministic tie ordering, whole-task capacity and no splitting, blockers, submitted exclusion, legacy defaults without read-time migration, server-owned submission timestamps, metadata validation and strict plan queries. Desktop and mobile browser tests additionally exercise Rescue tonight, persisted browser budgets, metadata editing, task estimates/blockers, filtering, progress, actual submission with unfinished-work confirmation, archive/reload/reopening, and task completion without automatic submission. Node tests exercise extraction, actual-day status logic, real HTTP CRUD, confirmation, validation, forged source rejection, origin/body protections, atomic concurrent writes, corruption, fresh-store persistence, and production serving. Playwright exercises desktop and 390px mobile: empty intake, review edits/add/remove, exact-source highlighting, save, completion and reload, filters, editing and reload, manual tasks after saving, both deletion paths, XSS-safe rendering, no-candidate handling, and displayed server errors. Screenshots are generated under `test-results/` (ignored). UI tests use a separate data file and loopback port 4179; do not run them against personal data. If a Chromium download is blocked but Google Chrome is installed, run `PLAYWRIGHT_CHANNEL=chrome npm run test:ui` in bash.

## Project map

- `src/`: React screens, local date/status model, responsive visual identity.
- `server/`: Express API, local extractor, atomic JSON store, dev/production entrypoint.
- `tests/`: Node integration/unit tests and Playwright workflows.
- `docs/superpowers/`: pre-implementation design and plan.

## Hackathon status

This repository is a working local MVP, **not a completed hackathon submission**. No claim of genuine Kiro usage is made. Genuine Kiro usage evidence, a functional public deployment URL, and a YouTube demo under three minutes are still required. Publishing this source code does not deploy the application.

## License

MIT — see [LICENSE](LICENSE).
