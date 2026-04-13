# Persistence Migration Plan

## Current Mapping

- `createProject` -> `Project.create`
- `createManuscript` -> `Manuscript.create`
- `createAuthor` -> `Author.create`
- `createClaim` -> `Claim.create`
- `createEvidence` -> `Evidence.create` with proposed `ClaimEvidenceLink` records
- `createFigure` -> `Figure.create` with proposed `ClaimFigureLink` records
- `createMethodBlock` -> `MethodBlock.create` with confirmed `ClaimMethodLink` records
- `createLimitation` -> `Limitation.create` with confirmed `ClaimLimitationLink` records
- `approveClaim` -> transaction updating `Claim` and inserting `ApprovalEvent`
- `approveClaimEvidenceLink` -> transaction upserting confirmed `ClaimEvidenceLink` and inserting `ApprovalEvent`
- `runReview` -> build structured graph from Prisma, run deterministic review, persist `AIReviewResult`
- `getStructuredManuscriptView` -> build structured graph from Prisma and render text placeholder
- `createExport` -> render export placeholder and persist `ExportPackage`

## Remaining Schema Gaps

- `Section.objectRefs` is still JSON and not DB-enforced.
- Polymorphic target references in approval, provenance, review, and audit records remain string-based.
- Figure-to-evidence and method-to-figure links are not fully normalized yet.
- Author contributor-role assignment exists in Prisma but is not wired through the MVP API flow.

## Persistence Status

- API routes for the main MVP workflow now use `src/persistence/prisma-workflow-store.ts`.
- The in-memory store remains for test fixtures and legacy demo-style unit tests only.
- A live PostgreSQL database and migrations are still required before runtime route calls can persist outside local process execution.

## Integration Validation

- Start the disposable local PostgreSQL database with `docker compose up -d postgres-test`.
- Set `TEST_DATABASE_URL` to a disposable PostgreSQL database URL.
- Run `npm run db:test:push` to apply the Prisma schema with `prisma db push`.
- Run `npm run test:integration` to execute the persisted MVP workflow test.
- Run `npm run validate:persistence` to do both steps in sequence.
- Stop and remove the disposable database with `docker compose down -v`.
