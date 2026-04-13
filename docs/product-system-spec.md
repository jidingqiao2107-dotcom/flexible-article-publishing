# Product / System Spec

## Product Scope Summary

Route A is an authoring SaaS for scientific publishing. It turns a scientific article into a structured research object while preserving compatibility with journals, manuscript submission systems, figure numbering, citation formatting, supplementary files, DOCX/PDF/LaTeX, and reviewer workflows.

The canonical source of truth is an internal structured domain model. Traditional manuscripts are rendered views compiled from that model.

ASSUMPTION: MVP users are authoring teams preparing a manuscript for a conventional journal submission.

## Functional Requirements

- Create projects and manuscripts.
- Manage authors, affiliations, contributor roles, corresponding author metadata, ORCID, funding, ethics, conflicts, data/code availability, identifiers, and journal targets.
- Upload or register assets for figures, datasets, software artifacts, supplementary files, tables, and attachments.
- Create fine-grained claims with claim type, strength, status, provenance, linked evidence, linked limitations, linked citations, linked methods, and linked figures.
- Create evidence objects that can point to figures, datasets, methods, citations, tables, notes, observations, or asset combinations.
- Assemble manuscript sections from structured objects instead of opaque prose blocks.
- Run deterministic AI-review-compatible checks that return structured review results.
- Require explicit author confirmation for claim approval, evidence approval, and pre-export final intent confirmation.
- Create durable approval events and audit logs for trust-critical actions.
- Export a legacy-compatible manuscript package through an abstract export compiler pipeline.

## Non-Functional Requirements

- Portable domain logic that does not depend on a specific web framework.
- Append-friendly audit and provenance records.
- Version references for claims, evidence links, methods, figures, generated text, and export snapshots.
- Safe defaults for unpublished research data: no autonomous publication, no silent AI overwrites, and explicit provenance for AI edits.
- Structured review output suitable for UI filtering, later workflow automation, and test reproducibility.
- Extensible metadata storage for future journal, persistent identifier, archiving, and machine-readable export workflows.

## Core Workflows

1. Create a project and manuscript.
2. Add manuscript metadata, authors, affiliations, and contributor roles.
3. Register figures, datasets, software artifacts, supplementary files, and other assets.
4. Create claims as granular publishable content objects.
5. Link claims to evidence, methods, citations, limitations, and figures.
6. Assemble sections from approved or explicitly marked structured objects.
7. Run AI first-reviewer checks.
8. Resolve unsupported or weakly supported claims.
9. Record author approvals at required gates.
10. Compile an export package only after final intent confirmation.

## Approval And Trust Model

- Gate 1: `claim_approval`. A human author must approve each claim.
- Gate 2: `claim_evidence_approval`. A claim cannot become publication-ready until evidence links are confirmed.
- Gate 3: `pre_export_intent_confirmation`. A human author confirms the rendered article still reflects their intent.
- AI actors may create suggestions and review flags but may not mark claims approved or publication-ready.
- Approved scientific content cannot be silently overwritten by AI-generated or AI-modified text.

FOUNDER DECISION: Whether publication-ready approval requires one corresponding author or all listed authors.

## AI Reviewer Model

The first reviewer returns structured issues with rule IDs, severity, linked entity IDs, recommended actions, and resolution status. Initial deterministic rules cover:

- Unsupported claim.
- Claim has evidence but no linked method.
- Overstated causal language without sufficient claim type/strength support.
- Orphan figure.
- Figure caption without linked evidence.
- Method used but insufficiently described.
- Missing limitation for high-risk or mechanism/conclusion claims.
- Dataset exists but no data availability statement.
- Software artifact exists but no code availability statement.
- Version diff contains unreviewed AI edits.

## Export Goals

Export is a compiler pipeline:

`structured research object -> export package -> rendered artifact`

MVP target is a DOCX-compatible placeholder manifest and manuscript text assembly. Future targets include PDF, LaTeX, reviewer packet, supplementary package, structured JSON, and JATS-like export.

ASSUMPTION: DOCX is the first legacy-compatible path because most journal workflows accept it.

## Risks And Open Questions

- Granularity can create author friction if the UI feels like data entry rather than authoring.
- AI output can appear authoritative unless review flags are visibly advisory and always human-resolved.
- Versioning scope can grow quickly; MVP starts with entity-level versions and export snapshots.
- Journal templates vary widely; avoid overfitting one target too early.
- Unpublished data requires a founder-level AI provider and retention policy.

FOUNDER DECISION: Whether AI assistance disclosure is mandatory for every export or configurable by submission target.

