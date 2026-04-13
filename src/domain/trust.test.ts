import { describe, expect, it } from "vitest";
import { createApprovalEvent, getExportReadiness } from "./policies";
import { sampleClaim, sampleGraph, sampleHumanAuthor } from "./sample-data";
import { getClaimTrustReadiness, getManuscriptTrustReadiness, createCurrentClaimTrustSnapshotRef, createCurrentManuscriptTrustSnapshotRef } from "./trust";
import { assessClaimValidity } from "./validity";
import type { ApprovalEvent, ResearchObjectGraph } from "./types";

const now = "2026-04-13T11:00:00.000Z";

function cloneGraph(): ResearchObjectGraph {
  return structuredClone(sampleGraph);
}

function withCurrentAiReview(graph: ResearchObjectGraph): ResearchObjectGraph {
  return {
    ...graph,
    auditLogs: [
      {
        id: "audit_review_complete",
        type: "audit_log",
        manuscriptId: graph.manuscript.id,
        projectId: graph.manuscript.projectId,
        actorType: "ai",
        actorId: "ai_first_reviewer",
        sourceClassification: "ai_suggestion",
        action: "ai_review.completed",
        targetEntityType: "manuscript",
        targetEntityId: graph.manuscript.id,
        createdAt: "2026-04-13T12:00:00.000Z"
      }
    ]
  };
}

function withClaimApproval(graph: ResearchObjectGraph): ResearchObjectGraph {
  const approval: ApprovalEvent = createApprovalEvent({
    id: "approval_claim_current",
    manuscriptId: graph.manuscript.id,
    approvalType: "claim_approval",
    actor: sampleHumanAuthor,
    targetEntityType: "claim",
    targetEntityId: sampleClaim.id,
    targetSnapshotRef: createCurrentClaimTrustSnapshotRef(graph, sampleClaim.id),
    approved: true,
    now
  });

  return {
    ...graph,
    claims: [
      {
        ...graph.claims[0],
        authorApproved: true,
        status: "approved"
      }
    ],
    approvals: [...graph.approvals, approval]
  };
}

function withFinalIntent(graph: ResearchObjectGraph): ResearchObjectGraph {
  const approval = createApprovalEvent({
    id: "approval_final_intent_current",
    manuscriptId: graph.manuscript.id,
    approvalType: "pre_export_intent_confirmation",
    actor: sampleHumanAuthor,
    targetEntityType: "manuscript",
    targetEntityId: graph.manuscript.id,
    targetSnapshotRef: createCurrentManuscriptTrustSnapshotRef(graph),
    approved: true,
    now
  });

  return {
    ...graph,
    approvals: [...graph.approvals, approval]
  };
}

describe("claim trust/readiness contract", () => {
  it("does not let AI review completion create human approval or publication readiness", () => {
    const graph = withCurrentAiReview(cloneGraph());
    const trust = getClaimTrustReadiness(graph, sampleClaim.id);

    expect(trust.aiReviewStatus).toBe("completed_current");
    expect(trust.humanApprovalStatus).toBe("missing");
    expect(trust.publicationReadiness.ready).toBe(false);
    expect(trust.blockers.some((item) => item.code === "missing_human_claim_approval")).toBe(true);
  });

  it("never reports publication-ready when hard blockers exist", () => {
    const graph = withCurrentAiReview(cloneGraph());
    const trust = getClaimTrustReadiness(graph, sampleClaim.id);

    expect(trust.lifecycleState).toBe("blocked");
    expect(trust.publicationReadiness.ready).toBe(false);
    expect(trust.exportModeEligibility.publicationIntent.eligible).toBe(false);
  });

  it("requires reapproval after a required linked object changes", () => {
    const approvedGraph = withClaimApproval(withCurrentAiReview(cloneGraph()));
    const changedGraph: ResearchObjectGraph = {
      ...approvedGraph,
      evidence: approvedGraph.evidence.map((item) =>
        item.id === approvedGraph.evidence[0].id
          ? { ...item, summary: `${item.summary} Revised analysis note.`, updatedAt: "2026-04-13T12:05:00.000Z" }
          : item
      )
    };

    const trust = getClaimTrustReadiness(changedGraph, sampleClaim.id);

    expect(trust.humanApprovalStatus).toBe("stale_reapproval_required");
    expect(trust.stale).toBe(true);
    expect(trust.lifecycleState).toBe("stale_reapproval_required");
  });

  it("treats figure changes after approval as reapproval-required", () => {
    const approvedGraph = withClaimApproval(withCurrentAiReview(cloneGraph()));
    const changedGraph: ResearchObjectGraph = {
      ...approvedGraph,
      figures: approvedGraph.figures.map((item) =>
        item.id === approvedGraph.figures[0].id
          ? { ...item, caption: `${item.caption} Updated figure interpretation note.`, updatedAt: "2026-04-13T12:06:00.000Z" }
          : item
      )
    };

    const trust = getClaimTrustReadiness(changedGraph, sampleClaim.id);
    expect(trust.stale).toBe(true);
    expect(trust.humanApprovalStatus).toBe("stale_reapproval_required");
  });

  it("distinguishes draft/internal sharing from publication-intent export", () => {
    const graph = withClaimApproval(withCurrentAiReview(cloneGraph()));
    const trust = getClaimTrustReadiness(graph, sampleClaim.id);

    expect(trust.exportModeEligibility.draftInternalShare.eligible).toBe(true);
    expect(trust.exportModeEligibility.publicationIntent.eligible).toBe(false);
    expect(trust.exportEligibility).toBe("draft_internal_only");
    expect(trust.finalIntentStatus).toBe("not_confirmed");
  });

  it("makes publication-intent export eligible only when final intent is current and blockers are cleared", () => {
    const graph = withFinalIntent(withClaimApproval(withCurrentAiReview(cloneGraph())));
    const trust = getClaimTrustReadiness(graph, sampleClaim.id);
    const manuscriptTrust = getManuscriptTrustReadiness(graph);

    expect(trust.publicationReadiness.ready).toBe(true);
    expect(trust.exportModeEligibility.publicationIntent.eligible).toBe(true);
    expect(manuscriptTrust.exportModeEligibility.publicationIntent.eligible).toBe(true);
  });

  it("keeps export behavior aligned with the same trust contract", () => {
    const graph = withFinalIntent(withClaimApproval(withCurrentAiReview(cloneGraph())));
    const manuscriptTrust = getManuscriptTrustReadiness(graph);
    const exportReadiness = getExportReadiness(graph);

    expect(exportReadiness.canExport).toBe(manuscriptTrust.exportModeEligibility.publicationIntent.eligible);
    expect(exportReadiness.blockingReasons).toEqual(manuscriptTrust.exportModeEligibility.publicationIntent.blockingReasons);
  });

  it("keeps single-claim and manuscript views aligned on readiness", () => {
    const graph = withClaimApproval(withCurrentAiReview(cloneGraph()));
    const claimTrust = getClaimTrustReadiness(graph, sampleClaim.id);
    const manuscriptTrust = getManuscriptTrustReadiness(graph).claimTrustReadiness.find((item) => item.claimId === sampleClaim.id);

    expect(manuscriptTrust).toEqual(claimTrust);
  });

  it("treats missing method support as a blocker when evidence is present", () => {
    const graph = withClaimApproval(
      withCurrentAiReview({
        ...cloneGraph(),
        claims: [
          {
            ...cloneGraph().claims[0],
            linkedMethods: []
          }
        ]
      })
    );
    const trust = getClaimTrustReadiness(graph, sampleClaim.id);

    expect(trust.blockers.some((item) => item.code === "missing_confirmed_method")).toBe(true);
    expect(trust.publicationReadiness.ready).toBe(false);
  });

  it("treats missing required limitation as a blocker for mechanism/conclusion claims", () => {
    const base = cloneGraph();
    const graph = withClaimApproval(
      withCurrentAiReview({
        ...base,
        claims: [
          {
            ...base.claims[0],
            claimType: "mechanism",
            linkedLimitations: []
          }
        ]
      })
    );
    const trust = getClaimTrustReadiness(graph, sampleClaim.id);

    expect(trust.blockers.some((item) => item.code === "missing_required_limitation")).toBe(true);
  });

  it("allows validity and trust to diverge without conflation", () => {
    const base = cloneGraph();
    const overclaimClaim = {
      ...base.claims[0],
      text: "Treatment A causes durable remission in all patients.",
      claimType: "conclusion" as const,
      strengthLevel: "weak" as const,
      linkedLimitations: [{ entityId: "limitation_004", status: "confirmed" as const }]
    };
    const overclaimGraph = withFinalIntent(
      withClaimApproval(
        withCurrentAiReview({
          ...base,
          limitations: [
            {
              id: "limitation_004",
              type: "limitation",
              manuscriptId: base.manuscript.id,
              text: "The cohort is observational and not fully generalizable.",
              linkedClaimIds: [sampleClaim.id],
              status: "draft",
              createdBy: sampleHumanAuthor.id,
              createdAt: now,
              updatedAt: now
            }
          ],
          claims: [overclaimClaim]
        })
      )
    );
    const trust = getClaimTrustReadiness(overclaimGraph, sampleClaim.id);
    const validity = assessClaimValidity({
      graph: overclaimGraph,
      claimId: sampleClaim.id,
      assessmentId: "validity_diverge",
      now
    });

    expect(trust.publicationReadiness.ready).toBe(true);
    expect(validity.scoreBand === "weak" || validity.scoreBand === "moderate").toBe(true);
  });
});
