import type {
  AIReviewResult,
  Actor,
  ApprovalEvent,
  AuditLog,
  Claim,
  EntityId,
  ExportReadinessReport,
  ProvenanceRecord,
  ResearchObjectGraph,
  SourceClassification
} from "./types";
import { getManuscriptTrustReadiness } from "./trust";

export class DomainPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainPolicyError";
  }
}

export function isHumanAuthor(actor: Actor): boolean {
  return actor.type === "human_author";
}

export type ApprovalAuthority = {
  isManuscriptAuthor: boolean;
  isProjectOwner: boolean;
  isCorrespondingAuthor: boolean;
};

export function assertCanApproveClaimAuthority(input: { actor: Actor; authority: ApprovalAuthority }): void {
  if (!isHumanAuthor(input.actor) || !input.authority.isManuscriptAuthor) {
    throw new DomainPolicyError("Claim approval requires an authorized human manuscript author.");
  }
}

export function assertCanApproveClaimEvidenceAuthority(input: {
  actor: Actor;
  authority: ApprovalAuthority;
}): void {
  if (!isHumanAuthor(input.actor) || !input.authority.isManuscriptAuthor) {
    throw new DomainPolicyError("Claim-evidence approval requires an authorized human manuscript author.");
  }
}

export function assertCanApproveClaimMethodAuthority(input: {
  actor: Actor;
  authority: ApprovalAuthority;
}): void {
  if (!isHumanAuthor(input.actor) || !input.authority.isManuscriptAuthor) {
    throw new DomainPolicyError("Claim-method approval requires an authorized human manuscript author.");
  }
}

export function assertCanApproveClaimLimitationAuthority(input: {
  actor: Actor;
  authority: ApprovalAuthority;
}): void {
  if (!isHumanAuthor(input.actor) || !input.authority.isManuscriptAuthor) {
    throw new DomainPolicyError("Claim-limitation approval requires an authorized human manuscript author.");
  }
}

export function assertCanConfirmFinalIntentAuthority(input: {
  actor: Actor;
  authority: ApprovalAuthority;
}): void {
  if (
    !isHumanAuthor(input.actor) ||
    (!input.authority.isProjectOwner && !input.authority.isCorrespondingAuthor)
  ) {
    throw new DomainPolicyError(
      "Final intent confirmation requires a human project owner or corresponding author."
    );
  }
}

export function createApprovalEvent(input: {
  id: EntityId;
  manuscriptId: EntityId;
  approvalType: ApprovalEvent["approvalType"];
  actor: Actor;
  sourceClassification?: SourceClassification;
  targetEntityType: string;
  targetEntityId: EntityId;
  targetVersionId?: EntityId;
  targetSnapshotRef?: string;
  approved: boolean;
  notes?: string;
  now?: string;
}): ApprovalEvent {
  const sourceClassification = input.sourceClassification ?? (input.actor.type === "ai" ? "ai_suggestion" : input.actor.type === "system" ? "system" : "human");

  if (
    ["claim_approval", "claim_evidence_approval", "pre_export_intent_confirmation"].includes(
      input.approvalType
    ) &&
    (!isHumanAuthor(input.actor) || sourceClassification !== "human")
  ) {
    throw new DomainPolicyError("Only a human author can create scientific authority approval events.");
  }

  return {
    id: input.id,
    type: "approval_event",
    manuscriptId: input.manuscriptId,
    approvalType: input.approvalType,
    actorType: input.actor.type,
    actorId: input.actor.id,
    sourceClassification,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef: input.targetSnapshotRef,
    approved: input.approved,
    notes: input.notes,
    createdAt: input.now ?? new Date().toISOString()
  };
}

export function approveClaim(input: {
  claim: Claim;
  actor: Actor;
  authority?: ApprovalAuthority;
  approvalEventId: EntityId;
  notes?: string;
  now?: string;
}): { claim: Claim; approvalEvent: ApprovalEvent } {
  if (input.authority) {
    assertCanApproveClaimAuthority({ actor: input.actor, authority: input.authority });
  }

  const approvalEvent = createApprovalEvent({
    id: input.approvalEventId,
    manuscriptId: input.claim.manuscriptId,
    approvalType: "claim_approval",
    actor: input.actor,
    targetEntityType: "claim",
    targetEntityId: input.claim.id,
    approved: true,
    notes: input.notes,
    now: input.now
  });

  return {
    claim: {
      ...input.claim,
      status: "approved",
      authorApproved: true,
      updatedAt: approvalEvent.createdAt
    },
    approvalEvent
  };
}

export function confirmedEvidenceCount(claim: Claim): number {
  return claim.linkedEvidence.filter((link) => link.status === "confirmed").length;
}

export function hasConfirmedMethod(claim: Claim): boolean {
  return claim.linkedMethods.some((link) => link.status === "confirmed");
}

export function hasBlockingOpenReviewFlag(claim: Claim, reviewResults: AIReviewResult[]): boolean {
  return reviewResults.some(
    (result) =>
      result.severity === "blocking" &&
      ["open", "acknowledged"].includes(result.resolutionStatus) &&
      result.linkedEntityIds.includes(claim.id)
  );
}

export function getClaimPublicationReadiness(input: {
  claim: Claim;
  reviewResults: AIReviewResult[];
}): ExportReadinessReport {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (!input.claim.authorApproved || !["approved", "publication_ready"].includes(input.claim.status)) {
    blockingReasons.push("Claim is not explicitly approved by a human author.");
  }

  if (confirmedEvidenceCount(input.claim) === 0) {
    blockingReasons.push("Claim has no confirmed evidence link.");
  }

  if (hasBlockingOpenReviewFlag(input.claim, input.reviewResults)) {
    blockingReasons.push("Claim has unresolved blocking AI review flags.");
  }

  if (!hasConfirmedMethod(input.claim)) {
    warnings.push("Claim has no confirmed method link.");
  }

  return {
    canExport: blockingReasons.length === 0,
    blockingReasons,
    warnings
  };
}

export function markClaimPublicationReady(input: {
  claim: Claim;
  reviewResults: AIReviewResult[];
  now?: string;
}): Claim {
  const readiness = getClaimPublicationReadiness(input);

  if (!readiness.canExport) {
    throw new DomainPolicyError(readiness.blockingReasons.join(" "));
  }

  return {
    ...input.claim,
    status: "publication_ready",
    publicationReady: true,
    updatedAt: input.now ?? new Date().toISOString()
  };
}

export function assertAiEditCanTouchClaim(input: {
  actor: Actor;
  claim: Claim;
  hasExplicitHumanApprovalForEdit: boolean;
}): void {
  if (
    input.actor.type === "ai" &&
    ["approved", "publication_ready"].includes(input.claim.status) &&
    !input.hasExplicitHumanApprovalForEdit
  ) {
    throw new DomainPolicyError("AI cannot silently overwrite approved scientific claim content.");
  }
}

export function createAiProvenanceRecord(input: {
  id: EntityId;
  manuscriptId: EntityId;
  targetEntityType: string;
  targetEntityId: EntityId;
  sourceObjectIds: EntityId[];
  modelActionType: string;
  preVersionId?: EntityId;
  postVersionId?: EntityId;
  now?: string;
}): ProvenanceRecord {
  if (input.sourceObjectIds.length === 0) {
    throw new DomainPolicyError("AI provenance must include at least one source object.");
  }

  return {
    id: input.id,
    type: "provenance_record",
    manuscriptId: input.manuscriptId,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    sourceObjectIds: input.sourceObjectIds,
    modelActionType: input.modelActionType,
    preVersionId: input.preVersionId,
    postVersionId: input.postVersionId,
    authorApprovalStatus: "pending",
    createdAt: input.now ?? new Date().toISOString()
  };
}

export function createAuditLogEntry(input: {
  id: EntityId;
  projectId?: EntityId;
  manuscriptId?: EntityId;
  actor: Actor;
  sourceClassification?: SourceClassification;
  action: string;
  targetEntityType: string;
  targetEntityId: EntityId;
  targetVersionId?: EntityId;
  targetSnapshotRef?: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  context?: Record<string, unknown>;
  now?: string;
}): AuditLog {
  return {
    id: input.id,
    type: "audit_log",
    projectId: input.projectId,
    manuscriptId: input.manuscriptId,
    actorType: input.actor.type,
    actorId: input.actor.id,
    sourceClassification:
      input.sourceClassification ??
      (input.actor.type === "ai" ? "ai_suggestion" : input.actor.type === "system" ? "system" : "human"),
    action: input.action,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef: input.targetSnapshotRef,
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    context: input.context,
    createdAt: input.now ?? new Date().toISOString()
  };
}

export function getFinalIntentApproval(graph: ResearchObjectGraph): ApprovalEvent | undefined {
  return graph.approvals.find(
    (approval) =>
      approval.approvalType === "pre_export_intent_confirmation" &&
      approval.targetEntityType === "manuscript" &&
      approval.targetEntityId === graph.manuscript.id &&
      approval.approved &&
      approval.actorType === "human_author"
  );
}

export function getExportReadiness(graph: ResearchObjectGraph): ExportReadinessReport {
  const trust = getManuscriptTrustReadiness(graph);
  return {
    canExport: trust.exportModeEligibility.publicationIntent.eligible,
    blockingReasons: trust.exportModeEligibility.publicationIntent.blockingReasons,
    warnings: trust.exportModeEligibility.publicationIntent.warningReasons
  };
}
