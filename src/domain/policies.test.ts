import { describe, expect, it } from "vitest";
import {
  approveClaim,
  assertCanApproveClaimAuthority,
  assertCanConfirmFinalIntentAuthority,
  createAiProvenanceRecord,
  createApprovalEvent,
  createAuditLogEntry,
  DomainPolicyError,
  getExportReadiness,
  markClaimPublicationReady,
  assertAiEditCanTouchClaim
} from "./policies";
import { sampleAiActor, sampleClaim, sampleGraph, sampleHumanAuthor } from "./sample-data";
import { createCurrentClaimTrustSnapshotRef, createCurrentManuscriptTrustSnapshotRef } from "./trust";
import type { Actor } from "./types";

const now = "2026-04-07T09:00:00.000Z";

function withCurrentAiReview() {
  return {
    ...sampleGraph,
    auditLogs: [
      {
        id: "audit_review_complete",
        type: "audit_log" as const,
        manuscriptId: sampleGraph.manuscript.id,
        projectId: sampleGraph.manuscript.projectId,
        actorType: "ai" as const,
        actorId: "ai_first_reviewer",
        sourceClassification: "ai_suggestion" as const,
        action: "ai_review.completed",
        targetEntityType: "manuscript",
        targetEntityId: sampleGraph.manuscript.id,
        createdAt: "2026-04-07T10:00:00.000Z"
      }
    ]
  };
}

describe("domain approval policies", () => {
  it("rejects AI-created scientific approval events", () => {
    expect(() =>
      createApprovalEvent({
        id: "approval_ai",
        manuscriptId: sampleClaim.manuscriptId,
        approvalType: "claim_approval",
        actor: sampleAiActor,
        targetEntityType: "claim",
        targetEntityId: sampleClaim.id,
        approved: true,
        now
      })
    ).toThrow(DomainPolicyError);
  });

  it("allows a human author to approve a claim and mark it publication-ready when evidence is confirmed", () => {
    const { claim: approvedClaim, approvalEvent } = approveClaim({
      claim: sampleClaim,
      actor: sampleHumanAuthor,
      approvalEventId: "approval_claim",
      now
    });

    const publicationReadyClaim = markClaimPublicationReady({
      claim: approvedClaim,
      reviewResults: [],
      now
    });

    expect(approvalEvent.actorType).toBe("human_author");
    expect(publicationReadyClaim.status).toBe("publication_ready");
    expect(publicationReadyClaim.publicationReady).toBe(true);
  });

  it("blocks publication readiness when confirmed evidence is missing", () => {
    const { claim: approvedClaim } = approveClaim({
      claim: { ...sampleClaim, linkedEvidence: [] },
      actor: sampleHumanAuthor,
      approvalEventId: "approval_claim_no_evidence",
      now
    });

    expect(() =>
      markClaimPublicationReady({
        claim: approvedClaim,
        reviewResults: [],
        now
      })
    ).toThrow("Claim has no confirmed evidence link.");
  });

  it("blocks silent AI overwrites of approved scientific claim content", () => {
    const approvedClaim = { ...sampleClaim, status: "approved" as const, authorApproved: true };

    expect(() =>
      assertAiEditCanTouchClaim({
        actor: sampleAiActor,
        claim: approvedClaim,
        hasExplicitHumanApprovalForEdit: false
      })
    ).toThrow("AI cannot silently overwrite approved scientific claim content.");
  });

  it("requires AI provenance records to include source objects", () => {
    expect(() =>
      createAiProvenanceRecord({
        id: "prov_empty",
        manuscriptId: sampleClaim.manuscriptId,
        targetEntityType: "claim",
        targetEntityId: sampleClaim.id,
        sourceObjectIds: [],
        modelActionType: "draft_section",
        now
      })
    ).toThrow("AI provenance must include at least one source object.");
  });

  it("requires final intent confirmation for export readiness", () => {
    const graph = withCurrentAiReview();
    const { claim: approvedClaim } = approveClaim({
      claim: sampleClaim,
      actor: sampleHumanAuthor,
      approvalEventId: "approval_claim_ready",
      now
    });
    const claimApproval = createApprovalEvent({
      id: "approval_claim_ready_event",
      manuscriptId: sampleGraph.manuscript.id,
      approvalType: "claim_approval",
      actor: sampleHumanAuthor,
      targetEntityType: "claim",
      targetEntityId: sampleClaim.id,
      targetSnapshotRef: createCurrentClaimTrustSnapshotRef(graph, sampleClaim.id),
      approved: true,
      now
    });
    const publicationReadyClaim = markClaimPublicationReady({ claim: approvedClaim, reviewResults: [], now });
    const readiness = getExportReadiness({
      ...graph,
      claims: [publicationReadyClaim],
      approvals: [claimApproval],
      aiReviewResults: []
    });

    expect(readiness.canExport).toBe(false);
    expect(readiness.blockingReasons.some((reason) => reason.includes("Final intent confirmation"))).toBe(true);
  });

  it("accepts export readiness after human final intent confirmation", () => {
    const graph = withCurrentAiReview();
    const { claim: approvedClaim } = approveClaim({
      claim: sampleClaim,
      actor: sampleHumanAuthor,
      approvalEventId: "approval_claim_ready_with_intent",
      now
    });
    const claimApproval = createApprovalEvent({
      id: "approval_claim_ready_with_intent_event",
      manuscriptId: sampleGraph.manuscript.id,
      approvalType: "claim_approval",
      actor: sampleHumanAuthor,
      targetEntityType: "claim",
      targetEntityId: sampleClaim.id,
      targetSnapshotRef: createCurrentClaimTrustSnapshotRef(graph, sampleClaim.id),
      approved: true,
      now
    });
    const publicationReadyClaim = markClaimPublicationReady({ claim: approvedClaim, reviewResults: [], now });
    const finalApproval = createApprovalEvent({
      id: "approval_final_intent",
      manuscriptId: sampleGraph.manuscript.id,
      approvalType: "pre_export_intent_confirmation",
      actor: sampleHumanAuthor,
      targetEntityType: "manuscript",
      targetEntityId: sampleGraph.manuscript.id,
      targetSnapshotRef: createCurrentManuscriptTrustSnapshotRef({
        ...graph,
        claims: [publicationReadyClaim],
        approvals: [claimApproval]
      }),
      approved: true,
      now
    });
    const readiness = getExportReadiness({
      ...graph,
      claims: [publicationReadyClaim],
      approvals: [claimApproval, finalApproval],
      aiReviewResults: []
    });

    expect(readiness.canExport).toBe(true);
  });

  it("does not allow a system actor to create final intent confirmation", () => {
    const systemActor: Actor = { id: "system", type: "system", displayName: "System" };

    expect(() =>
      createApprovalEvent({
        id: "approval_system_final",
        manuscriptId: sampleGraph.manuscript.id,
        approvalType: "pre_export_intent_confirmation",
        actor: systemActor,
        targetEntityType: "manuscript",
        targetEntityId: sampleGraph.manuscript.id,
        approved: true,
        now
      })
    ).toThrow(DomainPolicyError);
  });

  it("rejects claim approval authority for a non-manuscript author", () => {
    expect(() =>
      assertCanApproveClaimAuthority({
        actor: sampleHumanAuthor,
        authority: {
          isManuscriptAuthor: false,
          isProjectOwner: false,
          isCorrespondingAuthor: false
        }
      })
    ).toThrow("Claim approval requires an authorized human manuscript author.");
  });

  it("requires final intent confirmation authority from an owner or corresponding author", () => {
    expect(() =>
      assertCanConfirmFinalIntentAuthority({
        actor: sampleHumanAuthor,
        authority: {
          isManuscriptAuthor: true,
          isProjectOwner: false,
          isCorrespondingAuthor: false
        }
      })
    ).toThrow("Final intent confirmation requires a human project owner or corresponding author.");
  });

  it("creates audit log entries with source classification and snapshot references", () => {
    const audit = createAuditLogEntry({
      id: "audit_001",
      manuscriptId: sampleGraph.manuscript.id,
      actor: sampleHumanAuthor,
      action: "approval.claim",
      targetEntityType: "claim",
      targetEntityId: sampleClaim.id,
      sourceClassification: "human",
      targetVersionId: "version_001",
      targetSnapshotRef: "snapshot://claim/001",
      now
    });

    expect(audit.sourceClassification).toBe("human");
    expect(audit.targetVersionId).toBe("version_001");
    expect(audit.targetSnapshotRef).toBe("snapshot://claim/001");
  });
});
