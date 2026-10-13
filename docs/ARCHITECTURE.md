# Initial Architecture and API Conventions

This describes intended design. Proposed endpoints are not live until implemented.

## Data flow
React client → Express routes → authentication/authorization and validation middleware → module services → Prisma/PostgreSQL.

Redis provides a rebuildable priority index for eligible claims. Background jobs check SLA deadlines and create database-backed notifications.

## Modules
- Auth: password hashing, login, JWT verification.
- Users/Teams: roles, membership, availability, workload.
- Claims: intake, details, search, lifecycle.
- Priority: deterministic scoring and ordering.
- Assignments: routing and reassignment history.
- SLA: deadline rules and repeat-safe scheduled checks.
- Notifications: in-app notifications and read state.
- Analytics: authorized aggregate queries.
- Audit: claim and assignment event history.

## Proposed API surface
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check |
| POST | `/api/auth/login` | Authenticate |
| GET | `/api/auth/me` | Current user |
| GET | `/api/claims` | List permitted claims |
| POST | `/api/claims` | Submit claim |
| GET | `/api/claims/:id` | Details and permitted history |
| PATCH | `/api/claims/:id/status` | Validated status transition |
| POST | `/api/claims/:id/assign` | Manager/admin assignment |
| GET | `/api/notifications` | Current user's notifications |
| PATCH | `/api/notifications/:id/read` | Mark own notification read |
| GET | `/api/analytics/overview` | Authorized dashboard aggregates |

## Invariants
1. Enforce data visibility and permissions on every server request.
2. Validate claim values and lifecycle transitions server-side.
3. Store history in the same transaction as state changes where feasible.
4. Store UTC timestamps and make SLA policy timezone explicit.
5. Make background work repeat-safe.
6. Redis is derived state and needs reconciliation from PostgreSQL.
7. Use synthetic data in tests and demos.
8. Never leak stack traces, secrets, or private claim data in API errors.
