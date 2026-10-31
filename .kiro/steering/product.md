---
inclusion: always
---

# Product

Deadline Cemetery is a local-first student assignment planner with a quiet cemetery visual identity. Students paste assignment briefs, review source-linked task candidates, and confirm tasks before saving. The application offers daily rescue plans, work-session logs, availability, multi-day recovery assessments, and explicit assignment submission tracking.

## Product rules

- Describe extraction as deterministic local rules, not AI. No AI provider integration is implemented.
- Preserve original brief quotes and verify source offsets. Manual edits must not rewrite source evidence.
- Keep actual submission deadlines separate from task planned dates; later plans must not relax deadlines.
- Time logged is not automatic progress. Incomplete work needs an explicit remaining-effort estimate.
- Completing all tasks means checklist ready, not assignment submitted. Submission requires a separate user action.
- Unknown availability is not zero. All assignments share each day's capacity.
- Greedy planning is not an optimal schedule or a guarantee of finishing. A packing miss alone does not prove infeasibility.
- Preserve useful student workflows, accessible controls, mobile usability, and reduced-motion support.
- Do not invent deployment, authentication, reminders, calendar sync, or hackathon usage evidence.
