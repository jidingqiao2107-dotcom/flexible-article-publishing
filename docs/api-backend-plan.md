# API + Backend Plan

## API Shape

Initial API route shells:

- `GET/POST /api/projects`
- `GET/POST /api/manuscripts`
- `GET /api/manuscript-view`
- `GET/POST /api/authors`
- `GET/POST /api/claims`
- `GET/POST /api/evidence`
- `POST /api/evidence-links`
- `GET/POST /api/figures`
- `GET/POST /api/methods`
- `GET/POST /api/limitations`
- `GET/POST /api/sections`
- `POST /api/approvals`
- `POST /api/ai-review`
- `POST /api/export`

Future API groups:

- `/api/manuscripts/:id/claims`
- `/api/manuscripts/:id/evidence`
- `/api/manuscripts/:id/figures`
- `/api/manuscripts/:id/approvals`
- `/api/manuscripts/:id/versions`
- `/api/manuscripts/:id/assets`

## Background Jobs

MVP can run deterministic review and placeholder export synchronously. Later background jobs should handle:

- File processing and virus scanning.
- Figure derivative generation.
- DOCX/PDF/LaTeX compilation.
- AI review runs.
- Structured export package generation.
- Citation metadata enrichment.

## File Storage Plan

Store file bytes in object storage and store asset metadata in PostgreSQL:

- Bucket/key.
- Original filename.
- MIME type.
- Checksum.
- Size.
- Source entity links.
- Upload actor.
- Created timestamp.

ASSUMPTION: Local development can use object-storage-compatible adapters later; schema should not assume a specific provider.

## Permission Model

Initial roles:

- `owner`
- `corresponding_author`
- `author`
- `internal_reviewer`
- `viewer`

Hard invariant: only human author roles can create approval events for scientific authority gates.

## Audit Log Design

Audit logs are append-only records with:

- Actor type and actor ID.
- Action.
- Target entity type and ID.
- Before and after snapshots when trust-critical.
- Request context metadata.
- Created timestamp.

## Versioning Strategy

MVP versioning uses entity-level version records plus export snapshots. A future phase can add semantic diffs and branch/merge workflows for collaborative review.
