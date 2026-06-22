# Architecture — [Project Name]

> This document is the source of truth for how the system is built. It is created during planning and maintained throughout execution. When code and this document diverge, update this document to match the code.

---

## System Overview
[2–4 sentences describing what the system does and how its major pieces fit together. Suitable as an onboarding summary for a new developer.]

## Component Map
[List or diagram of the major components. Include which layer each lives in (frontend, API, background jobs, database, external integrations).]

```
[e.g.
  Browser (Angular/Next.js)
    └── GraphQL API (ASP.NET Core / Hot Chocolate)
         ├── Domain logic (CQRS handlers, validators)
         ├── PostgreSQL (EF Core, multi-tenant via global query filters)
         └── Keycloak (auth, multi-tenant SSO)
]
```

## Data Model Summary
[Key entities and their relationships. Not a full ERD — just enough to orient someone reading a task file.]

| Entity | Table / Schema | Notes |
|--------|---------------|-------|
| [Entity name] | [schema.table] | [Key fields, relationships, soft-delete, tenant-scoped?] |
| ... | | |

## External Integrations
[Any third-party services, APIs, or systems this project depends on.]

| Service | Purpose | Auth method | Notes |
|---------|---------|-------------|-------|
| [Service name] | [What it does] | [API key / OAuth / webhook] | [Rate limits, sandbox env?] |
| ... | | | |

## Key Constraints
[Decisions made early that shape everything downstream. Link to the relevant ADR for each.]

- [e.g. Multi-tenant via shared schema — global EF query filters on `TenantId`. See ADR-001.]
- [e.g. All timestamps stored in UTC; converted at presentation layer.]
- [e.g. No classes ending in `Service` — strict SRP, domain-named classes.]

## Layer Responsibilities

| Layer | What lives here | What does NOT live here |
|-------|----------------|------------------------|
| Frontend | UI state, form validation, display formatting | Business logic, auth decisions |
| API (GraphQL) | Query/mutation resolvers, auth middleware | Heavy computation, direct DB writes outside EF |
| Domain | CQRS handlers, FluentValidation, business rules | HTTP concerns, EF migrations |
| Database | Schema, indexes, migrations | Business logic |

## Testing Strategy
[Which layers have which kinds of tests, and any shared test infrastructure worth noting.]

- Unit: [What's covered, which framework]
- Integration: [DB-hit tests, test isolation approach]
- E2E: [Playwright targets, scope]

---

*Maintained by the PM agent during planning. Developer agent updates after each task that changes the architecture.*
