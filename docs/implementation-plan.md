# Implementation Plan

## Phase 1: Foundation

- Pause feature work until dependency installation, Prisma generation, typecheck, tests, and build pass from a clean checkout.
- Add product, domain, UX, backend, and roadmap docs.
- Scaffold Next.js/TypeScript modular monolith.
- Add Prisma schema for MVP research-object entities.
- Add portable TypeScript domain types and policy invariants.
- Add deterministic AI review stubs.
- Add export compiler placeholder.
- Add tests for the core invariants.

## Phase 2: MVP Persistence And Forms

- Wire API routes to Prisma.
- Add project, manuscript, claim, evidence, figure, method, limitation, and approval forms.
- Add upload metadata records and object storage adapter.
- Add simple manuscript section assembly.

## Phase 3: Review And Export Workflow

- Add AI review run history.
- Add review resolution UI.
- Add export readiness checks.
- Generate a real DOCX file from structured sections and approved objects.
- Record export packages and snapshots.

## Phase 4: Collaboration And Journal Fit

- Add richer version comparison.
- Add journal template mapping.
- Add citation formatting pipeline.
- Add reviewer packet and supplementary package exports.

## Test Strategy

- Unit test domain invariants.
- Unit test deterministic AI review rules.
- Unit test export blocking and placeholder rendering.
- Add integration tests once persistence is wired.
- Add snapshot tests for schema-stable AI review output.

## Risk Mitigation

- Keep domain logic framework-independent.
- Prefer explicit join records over hidden inference.
- Treat AI actions as provenance-producing suggestions.
- Keep export compiler modular so DOCX, LaTeX, PDF, reviewer packet, and machine-readable output can evolve independently.
