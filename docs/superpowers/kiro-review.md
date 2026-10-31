# Kiro Code Review Report
**Review status:** The proposed fix below was rejected during independent review. Blocked work still requires capacity after its blocker is resolved. Excluding it hides genuine total-minute shortages. The original capacity accounting was restored, and the regression test now checks both sufficient and insufficient capacity while confirming blocked work is never scheduled. The original report below is retained as a record of the proposal, not an accepted correctness claim. Its test results are the original reviewer's results, not independent verification.

**Date:** October 31, 2026
**Reviewer:** Kiro (AI coding assistant)

## Independent verification after correction

The corrected final code passed `npm run build`, `npm test` (23 passed, zero failed), and `npm run test:ui` (20 passed, desktop and mobile). The replacement regression test failed against the proposed blocked-work exclusion before the original capacity accounting was restored, then passed in the full suite. No runtime code change from the original committed capacity calculation was needed.

## Original review scope (proposal rejected)

Conducted a systematic review of Deadline Cemetery's scheduling logic focusing on:
- Submission deadline handling
- Shared daily capacity allocation
- Blocked task treatment in recovery planning

Reviewed files:
- `.kiro/steering/` (product, structure, tech guidelines)
- `README.md` (product specification)
- `package.json` (dependencies and scripts)
- `server/plan.js` (daily planning logic)
- `server/recovery.js` (multi-day recovery assessment)
- `tests/plan.test.js` (planning test coverage)
- `tests/recovery.test.js` (recovery test coverage)
- `tests/scheduling-invariants.test.js` (invariant checks)

## Bug Found and Fixed

**Issue:** Blocked tasks incorrectly counted in capacity failure checks

**Location:** `server/recovery.js`, line 36 in the `capacityFailure` calculation

**Description:**
The recovery assessment's capacity failure check included blocked tasks when determining if an assignment could fit within available time. This caused false "Does not fit" verdicts with the warning "Current availability cannot cover this assignment by its target dates..." even when there was sufficient capacity for all unblocked work.

**Example:**
- Assignment with 100 minutes of blocked work + 30 minutes of unblocked work
- 120 minutes of available capacity across the planning horizon
- Old behavior: Reports capacity failure (130 > 120)
- Correct behavior: No capacity failure (30 ≤ 120), status remains "Does not fit" due to blocker only

**Root cause:**
The `due` filter in the capacity check selected tasks by `effectiveDeadline` only, without excluding blocked tasks:
```javascript
const due=own.filter(t=>t.effectiveDeadline&&t.effectiveDeadline<=deadline);
```

**Fix:**
Added `&&!t.blocked` to the filter:
```javascript
const due=own.filter(t=>t.effectiveDeadline&&t.effectiveDeadline<=deadline&&!t.blocked);
```

This ensures only schedulable (unblocked) work counts toward capacity requirements, while blocked work still correctly prevents a "Fits" verdict through the existing `blockedMinutes` check.

## Testing

**Regression test added:**
`tests/recovery.test.js` - "capacity failure excludes blocked tasks from necessary capacity check"

The test verifies that an assignment with sufficient capacity for unblocked work does not trigger a capacity failure warning, even when blocked work exists.

**Verification results:**
- `npm run build` — ✓ Successful (2.23s, no warnings)
- `npm test` — ✓ All 23 tests passed (2.36s)
- `npm run test:ui` — ✓ All 20 Playwright tests passed (1.2m)

All existing tests continue to pass, confirming the fix does not break other scheduling logic.

## What Was Not Changed

- Daily planning logic (`buildPlan`) correctly excludes blocked tasks from scheduling
- Capacity warning (`dueMinutes`) intentionally includes blocked work per product specification
- Submission deadline inheritance and precedence logic is correct
- Shared capacity allocation across assignments works as designed
- All video production assets, user data, and uncommitted work preserved
- No commits or pushes were made

## Additional Observations

The codebase has strong test coverage for scheduling edge cases:
- Deadline inheritance and precedence between task dates and assignment deadlines
- Whole-task vs. splittable allocation
- Greedy packing limitations (correctly labeled as "At risk" not "impossible")
- Unknown availability vs. known-zero capacity
- Concurrent session retry protection
- Legacy data compatibility

The scheduling logic correctly implements the documented product rules, including the principle that "a later task date never relaxes an actual submission deadline."
