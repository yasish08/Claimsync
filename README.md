# CLAIMSYNC — Intelligent Insurance Claims Processing

An MVP insurance claims workflow platform for claim intake, validation, priority scoring, agent assignment, SLA monitoring, audit history, and analytics.

> **Status:** Initial project setup. Roadmap features are planned until implemented and tested.

## Planned stack
- Frontend: React + Vite + JavaScript + CSS/Tailwind
- Backend: Node.js + Express.js
- Database: PostgreSQL + Prisma ORM
- Queue: Redis
- Security: JWT, bcrypt, and server-side role-based access (admin, manager, agent)
- Quality: unit and API integration tests

## Core workflow
1. Authenticate a user with an assigned role.
2. Submit and validate a claim.
3. Calculate priority from documented urgency, deadline risk, and business impact.
4. Assign eligible claims to agents and sort queues.
5. Track claim status, history, and SLA deadlines.
6. Notify users about assignments and deadline risks.
7. View workload and outcome analytics.

## Architecture decision
Start with one modular Express application rather than separate microservices. PostgreSQL is the source of truth; Redis is a recoverable queue/index.

## Planned structure
```text
Claimsync/
├── client/                 # React + Vite
├── server/                 # Express API and Prisma schema
├── docs/                   # Roadmap and architecture notes
├── .env.example
└── README.md
```

## Development guardrails
- Enforce permissions in the API, not only in the UI.
- Validate claim inputs and allowed state transitions server-side.
- Audit status and assignment changes.
- Handle SLA timezones deliberately and make background jobs retry-safe.
- Use synthetic data in demos.
- Priority weights are product decisions to evaluate, not an industry-standard formula.
- Publish performance results only after reproducible measurements.

See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).