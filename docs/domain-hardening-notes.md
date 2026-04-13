# Domain Hardening Notes

## Minimal Changes Applied

- Added a Prisma `EvidenceType` enum instead of storing evidence type as an unconstrained string.
- Added confirmation metadata to claim-figure, claim-method, claim-citation, and claim-limitation link records to match claim-evidence link semantics.
- Added an explicit `AuditLog` to `Manuscript` relation.
- Added indexes for common manuscript, rule, status, and target-entity lookups.
- Added Gate 2 claim-evidence approval as a first-class in-memory workflow event.

## Known Technical Debt

- Prisma persistence is schema-first only; the active demo workflow still uses the in-memory adapter.
- `Section.objectRefs` remains JSON for MVP speed; future hardening should consider a typed section-object join table if ordering/link validation becomes complex.
- `targetEntityType`/`targetEntityId` polymorphic references in approval, audit, provenance, and AI review records are flexible but not DB-enforced.
- Author roles are represented in Prisma but not fully modeled in the in-memory workflow.

## Guardrails To Preserve

- AI must not create scientific approval events.
- Confirmed evidence, method, and limitation links must remain human-author actions.
- Claims should not become publication-ready without human claim approval and confirmed evidence.

