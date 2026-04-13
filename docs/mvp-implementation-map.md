# MVP Implementation Map

## Already Scaffolded

- Next.js App Router shell with project and workspace pages.
- API route shells for projects, manuscripts, authors, claims, evidence, figures, methods, limitations, sections, approvals, AI review, manuscript view, and export.
- Prisma schema for structured research-object entities and supporting metadata.
- Portable TypeScript domain types, approval policies, graph operations, deterministic AI review rules, and export placeholder rendering.

## Prisma-Backed Implemented

- API-backed core MVP path: create project, create manuscript, add author metadata, create claim/evidence/figure/method/limitation, confirm claim-evidence approval, approve claim, run deterministic AI review, mark publication-ready, create a simple section, render manuscript view, and create export placeholder.

## Partially Implemented

- Approval checkpoints exist in domain rules and Prisma-backed API flows, but full role-based authorization is not wired yet.
- Structured manuscript rendering exists as a simple text view, not a real DOCX/PDF compiler.
- The in-memory store remains only for fixture-style tests and non-persistent demo helpers.

## Still Missing

- Migrations tested against a running PostgreSQL database.
- Real asset upload/object storage.
- Authenticated project membership and role enforcement beyond domain-level actor checks.
- Real export artifact generation.
- Production AI integration and provenance-aware suggestion review UI.
