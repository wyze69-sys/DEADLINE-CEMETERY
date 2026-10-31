# Implementation plan

1. Express JSON API: validated extraction and assignment/task operations; loopback binding, origin checks, body limits, consistent JSON errors, serialized atomic local JSON storage. Production serves Vite output from same origin.
2. Conservative line-based deterministic extraction: preserve verbatim source quotes and offsets, full explicit dates only, flag missing years/relative/ambiguous dates, no inferred dates. Human review required.
3. React three-screen interface with add/remove/edit review rows, explicit confirmation, persisted dashboard, completion/edit/delete/filter controls and evidence highlighting.
4. Node test suite for extraction, persistence, validation and API; browser UI tests using Playwright if available/installable. Build and exercise production server; no external deployment or commits.
5. README startup, data safety, parser limitations and hackathon compliance gaps; MIT license and ignore generated/local files.
