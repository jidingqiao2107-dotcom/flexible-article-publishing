import { describe, expect, it } from "vitest";
import { createApprovalEvent } from "./policies";
import { sampleGraph, sampleHumanAuthor } from "./sample-data";
import { createCurrentClaimTrustSnapshotRef, getClaimTrustReadiness } from "./trust";
import { assessClaimValidity } from "./validity";
import { answerGroundedDiscussion, buildProjectMemorySummary } from "./project-memory";

function buildGraphForMemory() {
  const reviewedGraph = {
    ...structuredClone(sampleGraph),
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
        createdAt: "2026-04-13T12:00:00.000Z"
      }
    ]
  };

  const approval = createApprovalEvent({
    id: "approval_claim_memory",
    manuscriptId: reviewedGraph.manuscript.id,
    approvalType: "claim_approval",
    actor: sampleHumanAuthor,
    targetEntityType: "claim",
    targetEntityId: reviewedGraph.claims[0].id,
    targetSnapshotRef: createCurrentClaimTrustSnapshotRef(reviewedGraph, reviewedGraph.claims[0].id),
    approved: true,
    now: "2026-04-13T12:01:00.000Z"
  });

  const withApproval = {
    ...reviewedGraph,
    claims: [
      {
        ...reviewedGraph.claims[0],
        authorApproved: true,
        status: "approved" as const
      }
    ],
    approvals: [approval]
  };

  const validityAssessment = assessClaimValidity({
    graph: withApproval,
    claimId: withApproval.claims[0].id,
    assessmentId: "validity_memory",
    now: "2026-04-13T12:02:00.000Z"
  });

  return {
    ...withApproval,
    validityAssessments: [validityAssessment],
    claimTrustReadiness: [getClaimTrustReadiness(withApproval, withApproval.claims[0].id)]
  };
}

describe("project memory summary", () => {
  it("builds strongest and weakest claim lists from claim analyses", () => {
    const graph = buildGraphForMemory();
    const memory = buildProjectMemorySummary({
      projectId: graph.manuscript.projectId,
      graphs: [graph],
      now: "2026-04-13T12:05:00.000Z"
    });

    expect(memory.claimAnalyses).toHaveLength(1);
    expect(memory.strongestClaims[0]?.claimId).toBe(graph.claims[0].id);
    expect(memory.weakestClaims[0]?.claimId).toBe(graph.claims[0].id);
  });

  it("returns grounded strongest-claims answers", () => {
    const graph = buildGraphForMemory();
    const memory = buildProjectMemorySummary({
      projectId: graph.manuscript.projectId,
      graphs: [graph]
    });

    const answer = answerGroundedDiscussion({
      memory,
      question: "What are the strongest claims?"
    });

    expect(answer.mode).toBe("memory_summary");
    expect(answer.answer).toContain(graph.claims[0].text);
    expect(answer.groundingNotes[0]).toContain("validity assessments");
    expect(answer.focus.scope).toBe("project");
    expect(answer.groundedContext.claims.length).toBeGreaterThan(0);
  });

  it("returns grounded missing-support and conservative rewrite answers for a selected claim", () => {
    const graph = buildGraphForMemory();
    const memory = buildProjectMemorySummary({
      projectId: graph.manuscript.projectId,
      graphs: [graph]
    });

    const missingSupport = answerGroundedDiscussion({
      memory,
      question: "What support is missing for this claim?",
      claimIds: [graph.claims[0].id]
    });
    const rewrite = answerGroundedDiscussion({
      memory,
      question: "Rewrite this claim more conservatively.",
      claimIds: [graph.claims[0].id]
    });

    expect(missingSupport.mode).toBe("missing_support");
    expect(missingSupport.referencedClaimIds).toEqual([graph.claims[0].id]);
    expect(missingSupport.focus.scope).toBe("claim");
    expect(missingSupport.groundedContext.claims[0]?.claimId).toBe(graph.claims[0].id);
    expect(rewrite.mode).toBe("conservative_rewrite");
    expect(rewrite.answer.toLowerCase()).toContain("suggest");
  });

  it("returns contradiction discussion when tension is detected", () => {
    const baseGraph = buildGraphForMemory();
    const contrastingClaim = {
      ...baseGraph.claims[0],
      id: "claim_contrast",
      text: "Treatment A causes marker B increase in the study cohort.",
      authorApproved: false,
      status: "draft" as const
    };
    const graph = {
      ...baseGraph,
      claims: [...baseGraph.claims, contrastingClaim],
      claimTrustReadiness: [
        ...baseGraph.claimTrustReadiness,
        getClaimTrustReadiness(
          {
            ...baseGraph,
            claims: [...baseGraph.claims, contrastingClaim]
          },
          contrastingClaim.id
        )
      ]
    };
    const memory = buildProjectMemorySummary({
      projectId: graph.manuscript.projectId,
      graphs: [graph]
    });

    const answer = answerGroundedDiscussion({
      memory,
      question: "Explain contradictions in this project."
    });

    expect(answer.mode).toBe("contradiction_tension");
    expect(answer.answer.toLowerCase()).toContain("increase");
    expect(answer.groundedContext.contradictions.length).toBeGreaterThan(0);
  });
});
