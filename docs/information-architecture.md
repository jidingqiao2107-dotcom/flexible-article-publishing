# Information Architecture / UX

## Navigation Model

- Projects dashboard
- Manuscript workspace
- Structured objects
- AI review
- Approvals and provenance
- Versions
- Export prep
- Settings and metadata

## Project Dashboard

Shows active projects, manuscripts, export status, unresolved review flags, and approval progress. Primary actions are create project, create manuscript, and resume review.

## Manuscript Workspace Layout

The workspace uses a split model:

- Left: manuscript outline and section assembly.
- Center: rendered authoring view built from structured objects.
- Right: context panel for linked claims, evidence, provenance, approvals, and AI review flags.

ASSUMPTION: MVP can use simple server-rendered screens and forms before adding richer drag-and-drop linking.

## Claim-Evidence Linking UI

Claims are shown as cards with:

- Claim text, claim type, strength, and status.
- Evidence chips for figures, datasets, tables, methods, citations, and notes.
- Link confirmation status.
- Missing evidence warnings.
- Publication readiness gate indicator.

The evidence panel lets authors link existing evidence or create a new evidence object from an uploaded asset, figure, method, citation, or note.

## AI Review Panel

AI review results are structured, filterable, and never presented as final scientific judgment. Each result shows:

- Rule ID.
- Severity.
- Linked entities.
- Evidence path.
- Recommended action.
- Resolution status.
- Human override/dismissal trail.

## Version Diff / Approval UI

The approval surface compares current text to prior versions and highlights AI-originated changes. Authors can:

- Approve claim text.
- Confirm claim-evidence mapping.
- Accept or reject AI text suggestions.
- Inspect provenance records.
- Record final export intent confirmation.

## Export / Submission Prep UI

Export prep shows:

- Target journal/template selection.
- Blocking readiness checks.
- Missing metadata.
- Final intent confirmation.
- Export package history.
- Rendered legacy output placeholder.

The export button remains blocked until required gates pass.

