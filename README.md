# CLAIMSYNC — Intelligent Insurance Claims Processing

CLAIMSYNC is a full-stack MVP for insurance claim intake, priority scoring, claim lifecycle management, agent assignment, audit history, and SLA monitoring.

## Implemented foundation

- React + Vite responsive dashboard.
- Express API with a health endpoint and consistent JSON errors.
- PostgreSQL data model via Prisma: users, claims, assignments, and claim history.
- JWT login, password hashing with bcrypt, authenticated sessions, and role middleware.
- Admin-managed user creation; safe first-admin bootstrap refuses to run if an admin already exists.
- Authenticated claim listing, filtering, pagination, detail view, validated claim intake, priority scoring, status transitions, assignment, and audit events.
- Initial tests for API health/404 behavior and role authorization.

## Stack

- Frontend: React, JavaScript, Vite, CSS
- Backend: Node.js, Express
- Database: PostgreSQL, Prisma
- Auth: JWT, bcrypt
- Redis sorted-set priority queue with database fallback
- Periodic SLA risk/breach monitor and per-user notifications for SLA risk, assignment, and status changes
- Claim analytics overview and agent workload endpoints
- Remaining: end-to-end deployment, deeper integration testing, UI polish, and production hardening

## Run locally

Requirements: Node.js 20+, npm, and PostgreSQL.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URL` to a local PostgreSQL database and replace the JWT and bootstrap-password placeholders with unique secrets.
4. Generate Prisma Client: `npm run db:generate`
5. Apply the development migration: `npm run db:migrate`
6. Create the initial admin once: `npm run db:seed`
7. Start frontend and API: `npm run dev` (the SLA monitor starts with the API by default; set `ENABLE_SLA_MONITOR=false` to disable it).

Frontend: `http://localhost:5173`. API: `http://localhost:4000`. Health: `GET /api/health`.

## API outline

- `POST /api/auth/login` — exchange email/password for a short-lived JWT.
- `GET /api/auth/me` — current authenticated user.
- `GET /api/users` — list users (admin/manager).
- `POST /api/users` — create a user (admin only).
- `GET /api/claims?page=1&pageSize=20&status=SUBMITTED&type=AUTO` — authenticated, paginated claim queue.
- `GET /api/claims/priority-queue` — Redis-backed priority order with a database fallback.
- `GET /api/analytics/overview` — authenticated claim counts, status/type breakdowns, and highest-priority claims.
- `GET /api/analytics/agents` — manager/admin agent workload overview.
- `GET /api/notifications?unread=true` — current user’s notifications, including SLA risk/breach, assignment, and status updates.
- `PATCH /api/notifications/:id/read` — mark one notification read.
- `PATCH /api/notifications/read-all` — mark all current-user notifications read.
- `GET /api/claims/:id` — claim detail, assignments, and history.
- `POST /api/claims` — validate and submit a claim.
- `PATCH /api/claims/:id/status` — transition a claim and append history; approval/rejection requires manager/admin.
- `POST /api/claims/:id/assign` — assign to an active agent/manager (admin/manager).

Protected endpoints require `Authorization: Bearer <token>`. No public registration endpoint is exposed. The bootstrap script refuses to create another administrator once one exists.

## Tests and build

```bash
npm test
npm run build
``

These commands must be run after dependency installation. A GitHub commit is not evidence that runtime tests or database migrations passed; verify them locally before using real data.

## Scope and safety

This is an MVP, not a production-certified insurance system. Use synthetic data while developing. Do not commit real customer details or secrets. Authentication is implemented, but production deployment still requires review of rate limiting, security headers, operational logging, backups, and privacy requirements.
