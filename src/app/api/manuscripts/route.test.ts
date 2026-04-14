import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApprovalEvent } from "@/domain/policies";
import { sampleGraph, sampleHumanAuthor } from "@/domain/sample-data";
import { createCurrentClaimTrustSnapshotRef, getClaimTrustReadiness } from "@/domain/trust";
import { assessClaimValidity } from "@/domain/validity";

const mocks = vi.hoisted(() => ({
  getResearchObjectGraph: vi.fn(),
  listManuscripts: vi.fn(),
  createManuscript: vi.fn()
}));

vi.mock("@/persistence/runtime-store", () => ({
  getResearchObjectGraph: mocks.getResearchObjectGraph,
  listManuscripts: mocks.listManuscripts,
  createManuscript: mocks.createManuscript
}));

import { GET } from "./route";

describe("manuscripts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns trust/readiness separately from validity, approvals, and AI review data", async () => {
    const baseGraph = structuredClone(sampleGraph);
    const reviewedGraph = {
      ...baseGraph,
      auditLogs: [
        {
          id: "audit_review_complete",
          type: "audit_log" as const,
          manuscriptId: baseGraph.manuscript.id,
          projectId: baseGraph.manuscript.projectId,
          actorType: "ai" as const,
          actorId: "ai_first_reviewer",
          sourceClassification: "ai_suggestion" as const,
          action: "ai_review.completed",
          targetEntityType: "manuscript",
          targetEntityId: baseGraph.manuscript.id,
          createdAt: "2026-04-13T12:00:00.000Z"
        }
      ]
    };
    const claimApproval = createApprovalEvent({
      id: "approval_claim_current",
      manuscriptId: reviewedGraph.manuscript.id,
      approvalType: "claim_approval",
      actor: sampleHumanAuthor,
      targetEntityType: "claim",
      targetEntityId: reviewedGraph.claims[0].id,
      targetSnapshotRef: createCurrentClaimTrustSnapshotRef(reviewedGraph, reviewedGraph.claims[0].id),
      approved: true,
      now: "2026-04-13T12:01:00.000Z"
    });
    const validityAssessment = assessClaimValidity({
      graph: reviewedGraph,
      claimId: reviewedGraph.claims[0].id,
      assessmentId: "validity_current",
      now: "2026-04-13T12:02:00.000Z"
    });
    const changedGraph = {
      ...reviewedGraph,
      claims: [
        {
          ...reviewedGraph.claims[0],
          authorApproved: true,
          status: "approved" as const
        }
      ],
      approvals: [claimApproval],
      validityAssessments: [validityAssessment],
      evidence: reviewedGraph.evidence.map((item, index) =>
        index === 0
          ? {
              ...item,
              summary: `${item.summary} Updated after approval.`,
              updatedAt: "2026-04-13T12:05:00.000Z"
            }
          : item
      )
    };

    mocks.getResearchObjectGraph.mockResolvedValue({
      ...changedGraph,
      claimTrustReadiness: [getClaimTrustReadiness(changedGraph, changedGraph.claims[0].id)]
    });

    const response = await GET(new Request(`http://localhost/api/manuscripts?manuscriptId=${changedGraph.manuscript.id}`));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.validityAssessments).toHaveLength(1);
    expect(payload.aiReviewResults).toEqual(changedGraph.aiReviewResults);
    expect(payload.approvals).toEqual([claimApproval]);
    expect(payload.claimTrustReadiness[0].humanApprovalStatus).toBe("stale_reapproval_required");
    expect(payload.claimTrustReadiness[0].stale).toBe(true);
    expect(payload.claimTrustReadiness[0].publicationReadiness.ready).toBe(false);
    expect(payload.validityAssessments[0].assessmentId).toBe("validity_current");
  });
});
