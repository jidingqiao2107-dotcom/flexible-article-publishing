# Route A Authoring SaaS

Structured-first authoring SaaS for scientific publishing. The canonical source of truth is a research object graph, not a Word/PDF-like manuscript blob.

## MVP Principles

- Human authors remain the scientific authority.
- AI can review, suggest, and flag, but cannot approve scientific conclusions.
- Claims must be explicitly linked to evidence, methods, citations, figures, and limitations where applicable.
- Export is a compiler pipeline from structured objects to legacy-compatible outputs.
- Provenance, approval events, and audit logs are first-class product data.

## Stack

Default MVP stack: Next.js App Router, TypeScript, PostgreSQL, Prisma, and object storage.

This repository is scaffolded as a modular monolith:

- `src/domain`: portable domain types and policy invariants
- `src/ai-review`: deterministic first-reviewer rules and structured output
- `src/export`: export compiler placeholders
- `src/persistence`: persistence adapter stubs
- `src/app`: Next.js UI and API route shells
- `prisma`: database schema
- `docs`: product, domain, UX, backend, and roadmap specs

## Runtime Contract

Use Node.js `20.19.5` with npm `10.8.2` for the recommended local runtime. npm is the canonical package manager for this scaffold.

The supported engine range is Node `>=20.9.0 <21` and npm `>=10.8.2 <11`.

The npm lockfile is part of the reproducibility contract. Use `npm ci` for clean installs.

## Local Setup

```bash
node --version
npm --version
npm ci
npm run prisma:generate
npm run typecheck
npm test
npm run lint
npm run build
```

Expected versions:

```bash
node --version
# v20.19.5

npm --version
# 10.8.2
```

If `package-lock.json` must be regenerated after dependency changes, use:

```bash
npm install --package-lock-only
```

## Persistence Validation

Start a disposable PostgreSQL test database with Docker Compose:

```bash
docker compose up -d postgres-test
```

Set the test database URL:

```bash
# macOS/Linux
export TEST_DATABASE_URL="postgresql://route_a:route_a_password@localhost:54329/route_a_authoring_test"

# Windows PowerShell
$env:TEST_DATABASE_URL="postgresql://route_a:route_a_password@localhost:54329/route_a_authoring_test"
```

Run the real Prisma-backed persistence validation:

```bash
npm run validate:persistence
```

Stop and remove the disposable database:

```bash
docker compose down -v
```
