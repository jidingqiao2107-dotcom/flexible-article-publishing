import { describe, expect, it } from "vitest";
import { approveClaim, createApprovalEvent, markClaimPublicationReady } from "@/domain/policies";
import { sampleGraph, sampleHumanAuthor } from "@/domain/sample-data";
import { createCurrentClaimTrustSnapshotRef, createCurrentManuscriptTrustSnapshotRef } from "@/domain/trust";
import { createDocxPlaceholderExport } from "./docx-placeholder";

const now = "2026-04-07T09:00:00.000Z";

const graphWithReview = {
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

describe("DOCX placeholder export compiler", () => {
  it("blocks export without required approval gates", () => {
    const result = createDocxPlaceholderExport({
      id: "export_blocked",
      graph: sampleGraph,
      createdBy: sampleHumanAuthor.id,
      now
    });

    expect(result.exportPackage.status).toBe("blocked");
    expect(result.renderedText).toBeUndefined();
    expect(result.exportPackage.readinessReport.canExport).toBe(false);
  });

  it("renders a placeholder artifact after claim and final intent approvals", () => {
    const { claim: approvedClaim } = approveClaim({
      claim: graphWithReview.claims[0],
      actor: sampleHumanAuthor,
      approvalEventId: "approval_claim_export",
      now
    });
    const publicationReadyClaim = markClaimPublicationReady({ claim: approvedClaim, reviewResults: [], now });
    const claimApproval = createApprovalEvent({
      id: "approval_claim_export_event",
      manuscriptId: sampleGraph.manuscript.id,
      approvalType: "claim_approval",
      actor: sampleHumanAuthor,
      targetEntityType: "claim",
      targetEntityId: sampleGraph.claims[0].id,
      targetSnapshotRef: createCurrentClaimTrustSnapshotRef(graphWithReview, sampleGraph.claims[0].id),
      approved: true,
      now
    });
    const finalApproval = createApprovalEvent({
      id: "approval_final_export",
      manuscriptId: sampleGraph.manuscript.id,
      approvalType: "pre_export_intent_confirmation",
      actor: sampleHumanAuthor,
      targetEntityType: "manuscript",
      targetEntityId: sampleGraph.manuscript.id,
      targetSnapshotRef: createCurrentManuscriptTrustSnapshotRef({
        ...graphWithReview,
        claims: [publicationReadyClaim],
        approvals: [claimApproval]
      }),
      approved: true,
      now
    });

    const result = createDocxPlaceholderExport({
      id: "export_generated",
      graph: {
        ...graphWithReview,
        claims: [publicationReadyClaim],
        approvals: [claimApproval, finalApproval],
        aiReviewResults: []
      },
      createdBy: sampleHumanAuthor.id,
      versionId: "version_export",
      now
    });

    expect(result.exportPackage.status).toBe("generated");
    expect(result.exportPackage.finalApprovalEventId).toBe(finalApproval.id);
    expect(result.renderedText).toContain(sampleGraph.manuscript.title);
    expect(result.renderedText).toContain(publicationReadyClaim.text);
  });

  it("allows draft/internal export while publication-intent export remains blocked", () => {
    const { claim: approvedClaim } = approveClaim({
      claim: graphWithReview.claims[0],
      actor: sampleHumanAuthor,
      approvalEventId: "approval_claim_draft_export",
      now
    });

    const draftResult = createDocxPlaceholderExport({
      id: "export_draft_mode",
      graph: {
        ...graphWithReview,
        claims: [approvedClaim],
        approvals: [
          createApprovalEvent({
            id: "approval_claim_only",
            manuscriptId: sampleGraph.manuscript.id,
            approvalType: "claim_approval",
            actor: sampleHumanAuthor,
            targetEntityType: "claim",
            targetEntityId: sampleGraph.claims[0].id,
            targetSnapshotRef: createCurrentClaimTrustSnapshotRef(graphWithReview, sampleGraph.claims[0].id),
            approved: true,
            now
          })
        ],
        aiReviewResults: []
      },
      createdBy: sampleHumanAuthor.id,
      mode: "draft_internal",
      now
    });

    const publicationResult = createDocxPlaceholderExport({
      id: "export_publication_mode",
      graph: {
        ...graphWithReview,
        claims: [approvedClaim],
        approvals: [
          createApprovalEvent({
            id: "approval_claim_only_again",
            manuscriptId: sampleGraph.manuscript.id,
            approvalType: "claim_approval",
            actor: sampleHumanAuthor,
            targetEntityType: "claim",
            targetEntityId: sampleGraph.claims[0].id,
            targetSnapshotRef: createCurrentClaimTrustSnapshotRef(graphWithReview, sampleGraph.claims[0].id),
            approved: true,
            now
          })
        ],
        aiReviewResults: []
      },
      createdBy: sampleHumanAuthor.id,
      mode: "publication_intent",
      now
    });

    expect(draftResult.exportOutcome.status === "allowed" || draftResult.exportOutcome.status === "warning_bearing_but_allowed").toBe(true);
    expect(draftResult.exportPackage.readinessReport.canExport).toBe(true);
    expect(publicationResult.exportOutcome.status).toBe("blocked");
    expect(publicationResult.exportPackage.readinessReport.canExport).toBe(false);
  });
});
