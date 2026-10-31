# Recovery implementation plan
1. Extend read-time normalization and task validation; preserve history as server-owned fields.
2. Add atomic session endpoint with bounded retry-safe history and availability GET/PUT.
3. Extend daily allocation and add shared-capacity multi-day recovery pure function and validated endpoint.
4. Add next-action session dialog, compact availability, optional weekly plan, attention and ready-to-submit section; retain existing workflows.
5. Add focused API/pure tests and desktop/mobile recovery flow; run npm test, npm run build, npm run test:ui and repair regressions.
6. Update README with actual semantics and limitations. No commit/push or production restart.
