# CLAIMSYNC MVP Roadmap

**Target release:** November 3, 2026. These are targets, not claims that features are already complete.

## Oct 14–17 — Foundation and authentication
- [ ] Create React + Vite client and Express API.
- [ ] Add `/api/health` and verify frontend/API communication.
- [ ] Configure PostgreSQL, Prisma, schema, and first migration.
- [ ] Add users, claims, teams, assignments, history, and notifications models.
- [ ] Implement password hashing, login, JWT verification, and protected routes.
- [ ] Enforce admin, manager, and agent permissions in the API.

**Exit:** protected app shell connects to the database and unauthorized API actions are rejected.

## Oct 18–20 — Claims workflow
- [ ] Claim intake with server-side validation and unique reference.
- [ ] SLA deadline rules by claim type.
- [ ] Claims list/detail, filters, sorting, and pagination.
- [ ] Validate lifecycle transitions server-side.
- [ ] Audit actor, timestamp, and changes.

**Exit:** claims can be submitted, reviewed, and updated without database hand-editing.

## Oct 21–23 — Priority and routing
- [ ] Pure, unit-tested priority score with documented ranges, weights, and tie-breaks.
- [ ] Route eligible claims by team, agent availability, and workload.
- [ ] Persist assignment/reassignment history.
- [ ] Add Redis sorted-set queue after database-backed priority logic works.
- [ ] Add queue reconciliation and recovery.

**Exit:** claims get reproducible scores and appear in the correct agent queues.

## Oct 24–26 — SLA, notifications, analytics
- [ ] Repeat-safe deadline checks with timezone boundary tests.
- [ ] Persist assignment and overdue notifications.
- [ ] Dashboard queries for status, priority, SLA compliance, workload, and processing time.
- [ ] Use database data rather than hardcoded chart values.

## Oct 27–30 — Integration and quality
- [ ] Test the submit-to-resolution workflow.
- [ ] Validate request bodies and query parameters.
- [ ] Configure secure headers, rate limits, and explicit CORS.
- [ ] Test roles, cross-user access, legal transitions, and constraints.
- [ ] Add unit/integration tests and UI loading, empty, error, and confirmation states.

## Oct 31–Nov 3 — Deployment and release
- [ ] Deploy UI, API, and PostgreSQL; store production secrets in provider settings.
- [ ] Seed synthetic demo data only.
- [ ] Compare FIFO vs priority processing with a reproducible simulation.
- [ ] Measure waiting time/SLA misses and report only observed results.
- [ ] Document architecture, schema, API, setup, and demo steps.
- [ ] Acceptance-test admin, manager, and agent flows; tag stable MVP.

## Scope guardrails
- Prefer a modular monolith over five microservices for this deadline.
- Defer optional tooling until the core workflow is stable.
- Never commit real secrets or customer insurance data.
- PostgreSQL is authoritative; Redis must be rebuildable.
