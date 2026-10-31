---
inclusion: always
---

# Technology and verification

## Stack

- JavaScript ES modules; React 19 with Vite 7.
- Express 5 serves the API and production frontend.
- Local JSON storage with serialized writes and atomic rename; one server process per data file.
- Node's built-in test runner for unit/integration tests; Playwright for browser workflows.

## Commands from repository root

- Install: `npm ci` (Node.js 22.12+).
- Development: `npm run dev`.
- Production: `npm run build`, then `npm start`.
- Verify in order: `npm run build`, `npm test`, then `npm run test:ui`.
- If needed, install the browser first: `npx playwright install chromium`.
- If browser download is blocked and Chrome is installed: `PLAYWRIGHT_CHANNEL=chrome npm run test:ui` in bash.

Build before backend tests: HTTP tests also check production static routes. Browser tests use isolated data and port 4179; never aim tests at personal data. Report actual commands and outcomes, not assumed passes.

## Safety

The default application binds to `127.0.0.1:4173`. It has no authentication or user isolation; do not expose it publicly with a tunnel or reverse proxy. Do not commit runtime data, credentials, `.env` files, dependency directories, build output, or test artifacts. Preserve source evidence and existing user data. Never delete a malformed data file to hide a storage error. Do not add paid API calls or external services without explicit approval.
