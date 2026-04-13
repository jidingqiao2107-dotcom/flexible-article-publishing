# Domain Model

## Entity Overview

Core entities:

- `Project`
- `Manuscript`
- `Section`
- `Claim`
- `Evidence`
- `Figure`
- `MethodBlock`
- `Citation`
- `Limitation`
- `ReviewComment`
- `AuthorResponse`
- `Version`
- `ApprovalEvent`
- `AIReviewResult`
- `ProvenanceRecord`
- `AuditLog`

Supporting entities:

- `Author`
- `Affiliation`
- `ContributorRole`
- `Asset`
- `Dataset`
- `SoftwareArtifact`
- `SupplementaryItem`
- `ExportPackage`
- `FundingInfo`
- `ConflictOfInterest`
- `EthicsStatement`
- `DataAvailability`
- `CodeAvailability`
- `IdentifierRecord`
- `SubmissionTarget`
- `JournalTemplate`

## Relationship Rules

- A manuscript belongs to one project.
- A section belongs to one manuscript and stores ordered references to structured objects.
- A claim belongs to one manuscript and can link to many evidence objects, limitations, citations, method blocks, and figures through explicit join records.
- Evidence can link to many claims and can reference assets, datasets, figures, tables, methods, citations, notes, or observations.
- AI-created or AI-modified content must create a `ProvenanceRecord`.
- Trust-critical state changes must create both an `ApprovalEvent` when applicable and an `AuditLog` entry.
- Export packages must point to an export snapshot and the approval event for final intent confirmation.

## State Machines

Claim status:

`draft -> suggested -> needs_revision -> approved -> publication_ready`

`blocked` may be entered from any non-final state.

Approval event types:

- `claim_approval`
- `claim_evidence_approval`
- `pre_export_intent_confirmation`
- `ai_edit_acceptance`
- `review_resolution`

AI review result status:

- `open`
- `acknowledged`
- `resolved`
- `dismissed_by_author`

Export status:

- `draft`
- `blocked`
- `ready`
- `generated`
- `superseded`

## Lifecycle Rules

- A claim can be approved only by a human actor.
- A claim can become publication-ready only if it has at least one confirmed evidence link and no blocking open AI review flags.
- AI may suggest text but may not silently replace approved claim text.
- A manuscript can be exported only after pre-export final intent confirmation.
- Any export package must record the version/snapshot pointer used.

## Example JSON

### Claim

```json
{
  "id": "claim_001",
  "type": "claim",
  "manuscriptId": "manuscript_001",
  "text": "Treatment A reduced marker B in the study cohort.",
  "claimType": "observation",
  "strengthLevel": "moderate",
  "status": "approved",
  "authorApproved": true,
  "publicationReady": false,
  "linkedEvidenceIds": ["evidence_001"],
  "linkedLimitationIds": ["limitation_001"],
  "linkedCitationIds": [],
  "linkedMethodBlockIds": ["method_001"],
  "sourceFigureIds": ["figure_001"],
  "provenanceIds": ["prov_001"],
  "reviewFlagIds": []
}
```

### Evidence

```json
{
  "id": "evidence_001",
  "type": "evidence",
  "manuscriptId": "manuscript_001",
  "evidenceType": "figure",
  "summary": "Figure 1 shows marker B reduction after Treatment A.",
  "linkedAssetIds": ["asset_001"],
  "linkedClaimIds": ["claim_001"],
  "confidenceNotes": "Effect is visible but cohort size is limited.",
  "provenanceIds": []
}
```

### AIReviewResult

```json
{
  "id": "review_001",
  "type": "ai_review_result",
  "manuscriptId": "manuscript_001",
  "ruleId": "claim.unsupported",
  "severity": "blocking",
  "message": "Claim has no linked evidence.",
  "linkedEntityIds": ["claim_002"],
  "recommendedAction": "Link evidence or revise the claim.",
  "resolutionStatus": "open",
  "modelActionType": "deterministic_rule_check"
}
```

### ApprovalEvent

```json
{
  "id": "approval_001",
  "type": "approval_event",
  "manuscriptId": "manuscript_001",
  "approvalType": "claim_evidence_approval",
  "actorType": "human_author",
  "actorId": "author_001",
  "targetEntityType": "claim",
  "targetEntityId": "claim_001",
  "approved": true,
  "createdAt": "2026-04-07T08:30:00.000Z",
  "notes": "Evidence chain checked against Figure 1 and method block."
}
```

