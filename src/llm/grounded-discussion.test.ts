import { afterEach, describe, expect, it, vi } from "vitest";
import { createApprovalEvent } from "@/domain/policies";
import { sampleGraph, sampleHumanAuthor } from "@/domain/sample-data";
import { createCurrentClaimTrustSnapshotRef, getClaimTrustReadiness } from "@/domain/trust";
import { assessClaimValidity } from "@/domain/validity";
import { buildProjectMemorySummary } from "@/domain/project-memory";
import { generateGroundedDiscussion } from "./grounded-discussion";

function buildMemory() {
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

  return buildProjectMemorySummary({
    projectId: withApproval.manuscript.projectId,
    graphs: [
      {
        ...withApproval,
        validityAssessments: [validityAssessment],
        claimTrustReadiness: [getClaimTrustReadiness(withApproval, withApproval.claims[0].id)]
      }
    ]
  });
}

describe("LLM grounded discussion layer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses deterministic mode when no OpenAI configuration exists", async () => {
    const answer = await generateGroundedDiscussion({
      memory: buildMemory(),
      question: "What are the strongest claims?",
      requestedMode: "auto"
    });

    expect(answer.sourceMode).toBe("deterministic_discussion_contract_v1");
    expect(answer.fallbackReason).toContain("No OpenAI API key configured");
  });

  it("uses the OpenAI-backed path when configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_DISCUSSION_MODEL", "gpt-5");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            answer: "The claim is currently one of the stronger remembered claims because the support bundle is relatively complete.",
            groundingNotes: ["Grounded in the stored support bundle and current validity summary."],
            suggestedFollowUps: ["What support is still missing for this claim?"]
          })
        })
      }))
    );

    const answer = await generateGroundedDiscussion({
      memory: buildMemory(),
      question: "Why is this claim only moderate validity?",
      claimIds: [sampleGraph.claims[0].id],
      requestedMode: "llm"
    });

    expect(answer.sourceMode).toBe("llm_openai_responses_v1");
    expect(answer.answer).toContain("stronger remembered claims");
    expect(answer.usedMemoryObjectIds.length).toBeGreaterThan(0);
  });

  it("falls back honestly when the LLM call fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unavailable");
      })
    );

    const answer = await generateGroundedDiscussion({
      memory: buildMemory(),
      question: "Rewrite this claim more conservatively.",
      claimIds: [sampleGraph.claims[0].id],
      requestedMode: "llm"
    });

    expect(answer.sourceMode).toBe("deterministic_discussion_contract_v1");
    expect(answer.fallbackReason).toContain("fell back");
  });
});
