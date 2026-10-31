# Deadline recovery

User delegated design decisions and approved autonomous execution. Keep the local React/Express/atomic JSON architecture and source evidence. No accounts, AI, cloud or calendar integrations.

## Chosen design
Add server-owned self-reported sessions and explicit remaining estimates; elapsed time is never a progress deduction. Legacy whole-task planning remains default. Opt-in splittable work gets bounded sessions. Availability is a persisted seven-day schedule; deterministic recovery planning consumes one shared capacity pool across all active assignments without mutating records. Dates outside the horizon and overdue dates are distinguished from capacity failures. Official deadlines never move.

Alternatives rejected: automatic time-based progress (misleading), separate per-assignment plans (double-book capacity), a calendar integration (unnecessary scope).

Dashboard leads with next action and work logging, then attention and ready-to-submit work. Weekly plan is optional disclosure. Existing cemetery, motion preferences, evidence, CRUD and submission confirmation remain.

## Data and validation
remainingMinutes defaults to estimate for incomplete legacy work, zero for completed. splittable defaults false; sessionMinutes defaults 25. Sessions have server UUID/time, bounded history, client request ID for retry safety. Continue/blocked require a positive remaining estimate; blocked requires a reason; finished sets remaining zero and completion. Reopen restores explicit remaining or total estimate. Daily and recovery plans count allocation minutes rather than original estimates.

## Verification
Run existing unit/API and desktop/mobile suites, add transition/idempotency/availability/shared-capacity/horizon/legacy tests and a real browser recovery workflow. Preserve isolated test data; no production restart or git publication.
