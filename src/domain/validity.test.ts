import { describe, expect, it } from "vitest";
import {
  assessClaimValidity,
  buildClaimSupportSnapshot,
  getClaimValidityStaleness,
  hydrateClaimValidityAssessment,
  selectLatestClaimValidityAssessments
} from "./validity";
import { approveClaim, createApprovalEvent, getExportReadiness, markClaimPublicationReady } from "./policies";
import { sampleClaim, sampleGraph, sampleHumanAuthor, sampleMethod } from "./sample-data";
import { createCurrentClaimTrustSnapshotRef, createCurrentManuscriptTrustSnapshotRef } from "./trust";
import type { Claim, Limitation, ResearchObjectGraph } from "./types";

const now = "2026-04-13T10:00:00.000Z";

function cloneGraph(): ResearchObjectGraph {
  return structuredClone(sampleGraph);
}

function withClaim(graph: ResearchObjectGraph, nextClaim: Claim): ResearchObjectGraph {
  return {
    ...graph,
    claims: graph.claims.map((claim) => (claim.id === nextClaim.id ? nextClaim : claim))
  };
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
        createdAt: "2026-04-13T10:15:00.000Z"
      }
    ]
  };
}

describe("claim validity contract", () => {
  it("does not create human approval or publication-ready state by itself", () => {
    const graph = cloneGraph();
    const assessment = assessClaimValidity({
      graph,
      claimId: sampleClaim.id,
      assessmentId: "validity_001",
      now
    });

    expect(assessment.overallValidityScore).toBeGreaterThan(0);
    expect(graph.claims[0].authorApproved).toBe(false);
    expect(graph.claims[0].publicationReady).toBe(false);
    expect(graph.claims[0].status).toBe("draft");
  });

  it("keeps the simple score and expanded dimensions consistent", () => {
    const assessment = assessClaimValidity({
      graph: cloneGraph(),
      claimId: sampleClaim.id,
      assessmentId: "validity_002",
      now
    });

    expect(assessment.overallValidityScore).toBe(assessment.expandableDimensions.integratedAssessment.score);
    expect(assessment.scoreBand).toBe("strong");
    expect(Array.isArray(assessment.suggestedNextActions)).toBe(true);
    expect(assessment.suggestedNextActions.every((item) => typeof item === "string" && item.length > 0)).toBe(true);
  });

  it("can rate a highly supported claim bundle strongly while export remains blocked by trust rules", () => {
    const graph = cloneGraph();
    const richEvidenceGraph: ResearchObjectGraph = {
      ...graph,
      evidence: [
        ...graph.evidence,
        {
          ...graph.evidence[0],
          id: "evidence_002",
          summary: "Independent replicate confirms the same marker B reduction.",
          linkedClaimIds: [sampleClaim.id],
          createdAt: now,
          updatedAt: now
        }
      ],
      claims: [
        {
          ...graph.claims[0],
          linkedEvidence: [
            ...graph.claims[0].linkedEvidence,
            { evidenceId: "evidence_002", status: "confirmed", confirmedBy: sampleHumanAuthor.id, confirmedAt: now }
          ],
          linkedLimitations: [{ entityId: "limitation_002", status: "confirmed" }]
        }
      ],
      limitations: [
        {
          id: "limitation_002",
          type: "limitation",
          manuscriptId: graph.manuscript.id,
          text: "The cohort is small and may not generalize to all contexts.",
          linkedClaimIds: [sampleClaim.id],
          status: "draft",
          createdBy: sampleHumanAuthor.id,
          createdAt: now,
          updatedAt: now
        }
      ]
    };
    const reviewedGraph = withCurrentAiReview(richEvidenceGraph);

    const validity = assessClaimValidity({
      graph: reviewedGraph,
      claimId: sampleClaim.id,
      assessmentId: "validity_003",
      now
    });
    const approved = approveClaim({
      claim: reviewedGraph.claims[0],
      actor: sampleHumanAuthor,
      approvalEventId: "approval_high_validity",
      now
    }).claim;
    const claimApproval = createApprovalEvent({
      id: "approval_high_validity_event",
      manuscriptId: reviewedGraph.manuscript.id,
      approvalType: "claim_approval",
      actor: sampleHumanAuthor,
      targetEntityType: "claim",
      targetEntityId: sampleClaim.id,
      targetSnapshotRef: createCurrentClaimTrustSnapshotRef(reviewedGraph, sampleClaim.id),
      approved: true,
      now
    });
    const publicationReady = markClaimPublicationReady({
      claim: approved,
      reviewResults: [],
      now
    });
    const readiness = getExportReadiness({
      ...reviewedGraph,
      claims: [publicationReady],
      approvals: [claimApproval]
    });

    expect(validity.scoreBand).toBe("high");
    expect(readiness.canExport).toBe(false);
    expect(readiness.blockingReasons.some((reason) => reason.includes("Final intent confirmation"))).toBe(true);
  });

  it("can rate a structurally complete claim bundle weakly when the statement overreaches its support", () => {
    const graph = cloneGraph();
    const overclaim: Claim = {
      ...graph.claims[0],
      text: "Treatment A causes durable remission in all patients.",
      claimType: "conclusion",
      strengthLevel: "weak",
      status: "approved",
      authorApproved: true,
      linkedMethods: [],
      linkedLimitations: []
    };

    const assessment = assessClaimValidity({
      graph: withClaim(graph, overclaim),
      claimId: overclaim.id,
      assessmentId: "validity_004",
      now
    });

    expect(assessment.scoreBand).toBe("weak");
    expect(overclaim.authorApproved).toBe(true);
    expect(overclaim.linkedEvidence.some((link) => link.status === "confirmed")).toBe(true);
  });

  it("treats simple process-like claims and interpretive claims differently", () => {
    const graph = cloneGraph();
    const observation = assessClaimValidity({
      graph,
      claimId: sampleClaim.id,
      assessmentId: "validity_005a",
      now
    });
    const interpretiveClaim: Claim = {
      ...graph.claims[0],
      text: "Treatment A causes the marker B reduction through pathway C.",
      claimType: "mechanism",
      strengthLevel: "moderate",
      linkedLimitations: []
    };
    const interpretive = assessClaimValidity({
      graph: withClaim(graph, interpretiveClaim),
      claimId: interpretiveClaim.id,
      assessmentId: "validity_005b",
      now
    });

    expect(observation.overallValidityScore).toBeGreaterThan(interpretive.overallValidityScore);
    expect(interpretive.suggestedNextActions).toContain(
      "Add a limitation that explains where the interpretation may not generalize."
    );
  });

  it("becomes stale when evidence changes and partially stale when limitation context changes later", () => {
    const graph = cloneGraph();
    const storedAssessment = assessClaimValidity({
      graph,
      claimId: sampleClaim.id,
      assessmentId: "validity_006",
      now
    });

    const evidenceChangedGraph: ResearchObjectGraph = {
      ...graph,
      evidence: graph.evidence.map((evidence) =>
        evidence.id === graph.evidence[0].id ? { ...evidence, summary: `${evidence.summary} Updated replicate note.`, updatedAt: "2026-04-13T10:30:00.000Z" } : evidence
      )
    };

    const evidenceFreshness = getClaimValidityStaleness({
      previousSnapshot: storedAssessment.basedOnSnapshot,
      currentSnapshot: buildClaimSupportSnapshot(evidenceChangedGraph, sampleClaim.id)
    });

    const limitationAdded: Limitation = {
      id: "limitation_003",
      type: "limitation",
      manuscriptId: graph.manuscript.id,
      text: "Residual confounding remains possible in the observational cohort.",
      linkedClaimIds: [sampleClaim.id],
      status: "draft",
      createdBy: sampleHumanAuthor.id,
      createdAt: now,
      updatedAt: now
    };
    const limitationChangedGraph: ResearchObjectGraph = {
      ...graph,
      claims: [
        {
          ...graph.claims[0],
          linkedLimitations: [{ entityId: limitationAdded.id, status: "confirmed" }]
        }
      ],
      limitations: [limitationAdded]
    };

    const limitationFreshness = getClaimValidityStaleness({
      previousSnapshot: storedAssessment.basedOnSnapshot,
      currentSnapshot: buildClaimSupportSnapshot(limitationChangedGraph, sampleClaim.id)
    });

    expect(evidenceFreshness.stale).toBe(true);
    expect(evidenceFreshness.freshnessStatus).toBe("stale");
    expect(evidenceFreshness.staleReasons).toContain("evidence_bundle_changed");
    expect(limitationFreshness.stale).toBe(true);
    expect(limitationFreshness.freshnessStatus).toBe("partially_stale");
    expect(limitationFreshness.staleReasons).toContain("limitation_context_changed");
  });

  it("marks claim wording changes as stale and figure or citation changes as partially stale", () => {
    const graph = cloneGraph();
    const baseline = assessClaimValidity({
      graph,
      claimId: sampleClaim.id,
      assessmentId: "validity_006b",
      now
    });

    const claimChangedFreshness = getClaimValidityStaleness({
      previousSnapshot: baseline.basedOnSnapshot,
      currentSnapshot: buildClaimSupportSnapshot(
        withClaim(graph, {
          ...graph.claims[0],
          text: "Treatment A was associated with lower marker B after cohort treatment."
        }),
        sampleClaim.id
      )
    });

    const graphWithCitation: ResearchObjectGraph = {
      ...graph,
      claims: [
        {
          ...graph.claims[0],
          linkedCitations: [{ entityId: "citation_001", status: "confirmed" }]
        }
      ],
      citations: [
        {
          id: "citation_001",
          type: "citation",
          manuscriptId: graph.manuscript.id,
          citationKey: "smith2026",
          title: "Marker B context study",
          authors: ["Smith"],
          linkedClaimIds: [sampleClaim.id],
          linkedSectionIds: [],
          createdBy: sampleHumanAuthor.id,
          createdAt: now,
          updatedAt: now
        }
      ]
    };
    const citationBaseline = assessClaimValidity({
      graph: graphWithCitation,
      claimId: sampleClaim.id,
      assessmentId: "validity_006c",
      now
    });
    const figureChangedGraph: ResearchObjectGraph = {
      ...graphWithCitation,
      figures: graphWithCitation.figures.map((figure) =>
        figure.id === graphWithCitation.figures[0].id ? { ...figure, caption: `${figure.caption} Updated caption nuance.`, updatedAt: "2026-04-13T10:20:00.000Z" } : figure
      ),
      citations: []
    };
    const partialFreshness = getClaimValidityStaleness({
      previousSnapshot: citationBaseline.basedOnSnapshot,
      currentSnapshot: buildClaimSupportSnapshot(figureChangedGraph, sampleClaim.id)
    });

    expect(claimChangedFreshness.freshnessStatus).toBe("stale");
    expect(claimChangedFreshness.staleReasons).toContain("claim_text_or_claim_strength_changed");
    expect(partialFreshness.freshnessStatus).toBe("partially_stale");
    expect(partialFreshness.staleReasons).toContain("figure_context_changed");
    expect(partialFreshness.staleReasons).toContain("citation_context_changed");
  });

  it("drops method adequacy when method context is missing and changes score when wording is toned up or down", () => {
    const graph = cloneGraph();
    const noMethodClaim: Claim = {
      ...graph.claims[0],
      linkedMethods: []
    };
    const noMethodAssessment = assessClaimValidity({
      graph: withClaim(graph, noMethodClaim),
      claimId: noMethodClaim.id,
      assessmentId: "validity_007a",
      now
    });
    const tonedUpClaim: Claim = {
      ...graph.claims[0],
      text: "Treatment A causes broad remission through direct pathway suppression.",
      claimType: "observation",
      strengthLevel: "strong"
    };
    const tonedDownClaim: Claim = {
      ...graph.claims[0],
      text: "Treatment A was associated with lower marker B in this cohort.",
      claimType: "observation",
      strengthLevel: "moderate"
    };
    const tonedUpAssessment = assessClaimValidity({
      graph: withClaim(graph, tonedUpClaim),
      claimId: tonedUpClaim.id,
      assessmentId: "validity_007b",
      now
    });
    const tonedDownAssessment = assessClaimValidity({
      graph: withClaim(graph, tonedDownClaim),
      claimId: tonedDownClaim.id,
      assessmentId: "validity_007c",
      now
    });

    expect(noMethodAssessment.expandableDimensions.methodAdequacy.score).toBeLessThan(40);
    expect(tonedUpAssessment.expandableDimensions.statementFit.score).toBeLessThan(
      tonedDownAssessment.expandableDimensions.statementFit.score
    );
  });

  it("keeps different views aligned on the same latest validity assessment", () => {
    const graph = cloneGraph();
    const olderAssessment = assessClaimValidity({
      graph,
      claimId: sampleClaim.id,
      assessmentId: "validity_old",
      now: "2026-04-13T08:00:00.000Z"
    });
    const updatedGraph: ResearchObjectGraph = {
      ...graph,
      methods: [
        {
          ...sampleMethod,
          content: `${sampleMethod.content} Additional calibration steps are documented.`,
          updatedAt: "2026-04-13T09:00:00.000Z"
        }
      ]
    };
    const currentAssessment = assessClaimValidity({
      graph: updatedGraph,
      claimId: sampleClaim.id,
      assessmentId: "validity_new",
      now: "2026-04-13T09:05:00.000Z"
    });

    const latest = selectLatestClaimValidityAssessments({
      assessments: [olderAssessment, currentAssessment],
      graph: updatedGraph
    })[0];
    const hydrated = hydrateClaimValidityAssessment({
      assessment: currentAssessment,
      graph: updatedGraph
    });

    expect(latest.assessmentId).toBe(currentAssessment.assessmentId);
    expect(latest.overallValidityScore).toBe(hydrated.overallValidityScore);
    expect(latest.freshnessStatus).toBe(hydrated.freshnessStatus);
  });

  it("does not confuse validity with final approval or export eligibility", () => {
    const graph = withCurrentAiReview(cloneGraph());
    const validity = assessClaimValidity({
      graph,
      claimId: sampleClaim.id,
      assessmentId: "validity_008",
      now
    });
    const finalIntent = createApprovalEvent({
      id: "approval_final_intent_only",
      manuscriptId: graph.manuscript.id,
      approvalType: "pre_export_intent_confirmation",
      actor: sampleHumanAuthor,
      targetEntityType: "manuscript",
      targetEntityId: graph.manuscript.id,
      targetSnapshotRef: createCurrentManuscriptTrustSnapshotRef(graph),
      approved: true,
      now
    });
    const readiness = getExportReadiness({
      ...graph,
      approvals: [finalIntent]
    });

    expect(validity.scoreBand).toBe("strong");
    expect(readiness.canExport).toBe(false);
    expect(readiness.blockingReasons.some((reason) => reason.includes("Human claim approval"))).toBe(true);
  });
});
