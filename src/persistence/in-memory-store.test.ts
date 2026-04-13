import { describe, expect, it, beforeEach } from "vitest";
import {
  approveClaimEvidenceLink,
  approveDemoClaim,
  createAuthor,
  createClaim,
  createEvidence,
  createFigure,
  createLimitation,
  createManuscript,
  createMethodBlock,
  createSection,
  getStructuredManuscriptView,
  markDemoClaimPublicationReady,
  resetDemoGraph,
  runReviewForDemoGraph
} from "./in-memory-store";

describe("MVP structured authoring workflow", () => {
  beforeEach(() => {
    resetDemoGraph();
  });

  it("supports the smallest project-to-assembled-manuscript path with human approvals", () => {
    const manuscript = createManuscript({
      projectId: "project_001",
      title: "Minimal Structured Manuscript",
      abstract: "A manuscript assembled from structured research objects.",
      keywords: ["mvp", "structured authoring"]
    });
    const author = createAuthor({
      displayName: "Dr. Human Author",
      email: "human.author@example.org",
      orcid: "0000-0001-2345-6789"
    });
    const claim = createClaim({
      text: "Treatment A reduced marker B in the study cohort.",
      claimType: "observation",
      strengthLevel: "moderate",
      createdBy: author.id
    });
    const evidence = createEvidence({
      evidenceType: "figure",
      summary: "Figure 1 shows a reduction in marker B after Treatment A.",
      linkedClaimIds: [claim.id],
      confidenceNotes: "Effect direction is clear in the plotted cohort summary.",
      createdBy: author.id
    });
    const figure = createFigure({
      figureNumber: "1",
      title: "Marker B response",
      caption: "Marker B decreases after Treatment A in the study cohort.",
      linkedClaimIds: [claim.id],
      linkedEvidenceIds: [evidence.id],
      createdBy: author.id
    });
    const method = createMethodBlock({
      title: "Marker B quantification",
      content:
        "Marker B was quantified from prepared cohort samples using a pre-specified assay protocol with batch controls, duplicate measurements, and blinded normalization before group-level comparison.",
      linkedClaimIds: [claim.id],
      linkedFigureIds: [figure.id],
      createdBy: author.id
    });
    const limitation = createLimitation({
      text: "The cohort size limits generalization beyond the sampled population.",
      linkedClaimIds: [claim.id],
      severityOrImportance: "moderate",
      createdBy: author.id
    });
    const evidenceApproval = approveClaimEvidenceLink({
      claimId: claim.id,
      evidenceId: evidence.id,
      notes: "Author checked figure and method support for the claim."
    });
    const claimApproval = approveDemoClaim(claim.id);
    const reviewResults = runReviewForDemoGraph();
    const readyClaim = markDemoClaimPublicationReady(claim.id);
    const section = createSection({
      title: "Results",
      objectRefs: [
        { entityType: "claim", entityId: claim.id, orderIndex: 1 },
        { entityType: "figure", entityId: figure.id, orderIndex: 2 },
        { entityType: "method_block", entityId: method.id, orderIndex: 3 },
        { entityType: "limitation", entityId: limitation.id, orderIndex: 4 }
      ]
    });
    const view = getStructuredManuscriptView();

    expect(manuscript.title).toBe("Minimal Structured Manuscript");
    expect(evidenceApproval.approvalEvent).toMatchObject({
      approvalType: "claim_evidence_approval",
      actorType: "human_author",
      targetEntityType: "claim_evidence_link",
      approved: true
    });
    expect(claimApproval.approvalEvent).toMatchObject({
      approvalType: "claim_approval",
      actorType: "human_author",
      approved: true
    });
    expect(reviewResults.filter((result) => result.severity === "blocking")).toHaveLength(0);
    expect(readyClaim.publicationReady).toBe(true);
    expect(section.objectRefs).toHaveLength(4);
    expect(view.renderedText).toContain("Treatment A reduced marker B");
    expect(view.objectCounts).toMatchObject({
      claims: 1,
      evidence: 1,
      figures: 1,
      methods: 1,
      limitations: 1
    });
  });
});

