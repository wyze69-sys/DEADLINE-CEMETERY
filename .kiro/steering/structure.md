---
inclusion: always
---

# Repository structure

- `src/`: React interface, date/status logic, responsive styling.
- `server/`: Express endpoints, deterministic extraction, JSON persistence, server entrypoint.
- `tests/`: Node unit/integration tests and Playwright workflows.
- `public/`: static application assets.
- `docs/superpowers/`: design and implementation documents.
- `.kiro/steering/`: project instructions for Kiro.
- `video-production/`: separate presentation/video work; do not change it for application-only tasks.

## Change boundaries

Keep changes focused. Inspect existing code before editing; preserve current conventions and avoid unnecessary dependencies. Add regression tests for changed business rules. Verify server validation as well as UI behavior. Keep README claims consistent with implemented behavior. Do not overwrite unrelated work, runtime data, or video assets. Do not commit or push without authorization for that action.
