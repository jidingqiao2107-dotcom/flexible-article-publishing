import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe.skipIf(!process.env.TEST_DATABASE_URL)("Prisma-backed authority and workflow integration", () => {
  let prisma: typeof import("./prisma-client").prisma;
  let store: typeof import("./prisma-workflow-store");
  let sessionRoute: typeof import("@/app/api/session/route");
  let approvalsRoute: typeof import("@/app/api/approvals/route");
  let exportRoute: typeof import("@/app/api/export/route");

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const prismaModule = await import("./prisma-client");
    const storeModule = await import("./prisma-workflow-store");
    sessionRoute = await import("@/app/api/session/route");
    approvalsRoute = await import("@/app/api/approvals/route");
    exportRoute = await import("@/app/api/export/route");
    prisma = prismaModule.prisma;
    store = storeModule;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Project" RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function seedWorkflow() {
    const project = await store.createProject({
      name: "Authority Validation Project",
      description: "Validates persisted authority rules.",
      createdBy: "owner_seed"
    });
    const manuscript = await store.createManuscript({
      projectId: project.id,
      title: "Authority Validated Manuscript",
      abstract: "A persisted manuscript assembled from structured research objects.",
      keywords: ["authority", "structured authoring"],
      createdBy: "owner_seed"
    });
    const owner = await store.createAuthor({
      projectId: project.id,
      manuscriptId: manuscript.id,
      displayName: "Dr. Owner Author",
      email: "owner.author@example.org",
      orcid: "0000-0001-0000-0000",
      memberRole: "owner",
      createdBy: "owner_seed"
    });
    const correspondingAuthor = await store.createAuthor({
      projectId: project.id,
      manuscriptId: manuscript.id,
      displayName: "Dr. Corresponding Author",
      email: "corresponding.author@example.org",
      orcid: "0000-0002-0000-0000",
      memberRole: "corresponding_author",
      createdBy: owner.id
    });
    const coauthor = await store.createAuthor({
      projectId: project.id,
      manuscriptId: manuscript.id,
      displayName: "Dr. Coauthor",
      email: "coauthor@example.org",
      orcid: "0000-0003-0000-0000",
      memberRole: "coauthor",
      createdBy: owner.id
    });
    const outsider = await store.createAuthor({
      projectId: project.id,
      displayName: "Dr. Outsider",
      email: "outsider@example.org",
      orcid: "0000-0004-0000-0000",
      createdBy: owner.id
    });
    const claim = await store.createClaim({
      manuscriptId: manuscript.id,
      text: "Treatment A causes marker B reduction in the study cohort.",
      claimType: "observation",
      strengthLevel: "moderate",
      createdBy: correspondingAuthor.id
    });
    const evidence = await store.createEvidence({
      manuscriptId: manuscript.id,
      evidenceType: "figure",
      summary: "Figure 1 shows marker B reduction after Treatment A.",
      linkedClaimIds: [claim.id],
      confidenceNotes: "Direction is clear but causal language should be reviewed.",
      createdBy: correspondingAuthor.id
    });
    const figure = await store.createFigure({
      manuscriptId: manuscript.id,
      figureNumber: "1",
      title: "Marker B response",
      caption: "Marker B decreases after Treatment A in the study cohort.",
      linkedClaimIds: [claim.id],
      linkedEvidenceIds: [evidence.id],
      createdBy: correspondingAuthor.id
    });
    const method = await store.createMethodBlock({
      manuscriptId: manuscript.id,
      title: "Marker B quantification",
      content:
        "Marker B was quantified from prepared cohort samples using a pre-specified assay protocol with batch controls, duplicate measurements, and blinded normalization before group-level comparison.",
      linkedClaimIds: [claim.id],
      linkedFigureIds: [figure.id],
      createdBy: correspondingAuthor.id
    });
    const limitation = await store.createLimitation({
      manuscriptId: manuscript.id,
      text: "The cohort size limits generalization beyond the sampled population.",
      linkedClaimIds: [claim.id],
      severityOrImportance: "moderate",
      createdBy: correspondingAuthor.id
    });

    return {
      project,
      manuscript,
      owner,
      correspondingAuthor,
      coauthor,
      outsider,
      claim,
      evidence,
      figure,
      method,
      limitation
    };
  }

  async function createSessionCookie(authorId: string): Promise<string> {
    const response = await sessionRoute.POST(
      new Request("http://localhost/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authorId, label: `session-${authorId}` })
      })
    );

    const cookie = response.headers.get("set-cookie");

    if (!cookie) {
      throw new Error(`Expected a session cookie for author ${authorId}.`);
    }

    return cookie;
  }

  it("rejects unauthorized claim approval and persists authorized claim approval with audit records", async () => {
    const workflow = await seedWorkflow();

    await expect(store.approveClaim(workflow.claim.id, workflow.outsider.id)).rejects.toThrow(
      "Claim approval requires an authorized human manuscript author."
    );

    const approved = await store.approveClaim(workflow.claim.id, workflow.correspondingAuthor.id, {
      notes: "Corresponding author approved this claim.",
      targetVersionId: "version_claim_001",
      targetSnapshotRef: "snapshot://claim/001"
    });

    expect(approved.claim.authorApproved).toBe(true);
    expect(approved.approvalEvent.actorId).toBe(workflow.correspondingAuthor.id);
    expect(approved.approvalEvent.sourceClassification).toBe("human");

    const persistedApproval = await prisma.approvalEvent.findUniqueOrThrow({
      where: { id: approved.approvalEvent.id }
    });
    expect(persistedApproval.approvalType).toBe("claim_approval");
    expect(persistedApproval.targetVersionId).toBe("version_claim_001");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "approval.claim",
        targetEntityType: "claim",
        targetEntityId: workflow.claim.id
      },
      orderBy: { createdAt: "desc" }
    });
    expect(audit.actorId).toBe(workflow.correspondingAuthor.id);
    expect(audit.sourceClassification).toBe("human");
    expect(audit.targetSnapshotRef).toBe("snapshot://claim/001");
  });

  it("rejects spoofed actorId in approval payloads and uses the resolved session actor instead", async () => {
    const workflow = await seedWorkflow();
    const cookie = await createSessionCookie(workflow.correspondingAuthor.id);

    const spoofedResponse = await approvalsRoute.POST(
      new Request("http://localhost/api/approvals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie
        },
        body: JSON.stringify({
          approvalType: "claim_approval",
          targetEntityId: workflow.claim.id,
          actorId: workflow.outsider.id
        })
      })
    );

    expect(spoofedResponse.status).toBe(400);
    await expect(spoofedResponse.json()).resolves.toMatchObject({
      error: "actorId must not be provided for approval-critical requests; identity is resolved from the server session."
    });

    const approvedResponse = await approvalsRoute.POST(
      new Request("http://localhost/api/approvals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie
        },
        body: JSON.stringify({
          approvalType: "claim_approval",
          targetEntityId: workflow.claim.id,
          notes: "Approved through resolved session identity."
        })
      })
    );

    expect(approvedResponse.status).toBe(200);
    const approvedPayload = await approvedResponse.json();
    expect(approvedPayload.approvalEvent.actorId).toBe(workflow.correspondingAuthor.id);
  });

  it("enforces claim-evidence approval authority, persists review results, and assembles a manuscript view from persisted data", async () => {
    const workflow = await seedWorkflow();

    await expect(
      store.approveClaimEvidenceLink({
        claimId: workflow.claim.id,
        evidenceId: workflow.evidence.id,
        actorId: workflow.outsider.id
      })
    ).rejects.toThrow("Claim-evidence approval requires an authorized human manuscript author.");

    const claimApproval = await store.approveClaim(workflow.claim.id, workflow.correspondingAuthor.id);
    const linkApproval = await store.approveClaimEvidenceLink({
      claimId: workflow.claim.id,
      evidenceId: workflow.evidence.id,
      actorId: workflow.correspondingAuthor.id,
      notes: "Corresponding author confirmed this evidence supports the claim."
    });
    const methodApproval = await store.approveClaimMethodLink({
      claimId: workflow.claim.id,
      methodBlockId: workflow.method.id,
      actorId: workflow.correspondingAuthor.id,
      notes: "Corresponding author confirmed this method produced the supporting evidence."
    });
    const reviewResults = await store.runReview(workflow.manuscript.id);
    const readyClaim = await store.markClaimPublicationReady(workflow.claim.id, workflow.correspondingAuthor.id);
    const section = await store.createSection({
      manuscriptId: workflow.manuscript.id,
      title: "Results",
      objectRefs: [
        { entityType: "claim", entityId: workflow.claim.id, orderIndex: 1 },
        { entityType: "figure", entityId: workflow.figure.id, orderIndex: 2 },
        { entityType: "method_block", entityId: workflow.method.id, orderIndex: 3 },
        { entityType: "limitation", entityId: workflow.limitation.id, orderIndex: 4 }
      ],
      createdBy: workflow.correspondingAuthor.id
    });
    const view = await store.getStructuredManuscriptView(workflow.manuscript.id);

    const persistedLink = await prisma.claimEvidenceLink.findUniqueOrThrow({
      where: { claimId_evidenceId: { claimId: workflow.claim.id, evidenceId: workflow.evidence.id } }
    });
    expect(persistedLink.status).toBe("confirmed");
    expect(persistedLink.confirmedBy).toBe(workflow.correspondingAuthor.id);
    expect(claimApproval.approvalEvent.approvalType).toBe("claim_approval");
    expect(linkApproval.approvalEvent.approvalType).toBe("claim_evidence_approval");
    expect(methodApproval.approvalEvent.approvalType).toBe("claim_method_approval");

    expect(reviewResults.some((result) => result.ruleId === "claim.causal_language_without_mechanism")).toBe(true);
    await expect(prisma.aIReviewResult.count()).resolves.toBeGreaterThan(0);
    await expect(prisma.approvalEvent.count()).resolves.toBe(2);

    const reviewAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "ai_review.completed",
        targetEntityType: "manuscript",
        targetEntityId: workflow.manuscript.id
      },
      orderBy: { createdAt: "desc" }
    });
    expect(reviewAudit.actorId).toBe("ai_first_reviewer");
    expect(reviewAudit.sourceClassification).toBe("ai_suggestion");

    expect(readyClaim.publicationReady).toBe(true);
    expect(section.objectRefs).toHaveLength(4);
    expect(view.renderedText).toContain("Treatment A causes marker B reduction");
    expect(view.objectCounts).toMatchObject({
      claims: 1,
      evidence: 1,
      figures: 1,
      methods: 1,
      limitations: 1
    });
  });

  it("rejects approval requests from a resolved actor without manuscript authority", async () => {
    const workflow = await seedWorkflow();
    const outsiderCookie = await createSessionCookie(workflow.outsider.id);

    const response = await approvalsRoute.POST(
      new Request("http://localhost/api/approvals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: outsiderCookie
        },
        body: JSON.stringify({
          approvalType: "claim_evidence_approval",
          targetEntityId: workflow.claim.id,
          evidenceId: workflow.evidence.id
        })
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Claim-evidence approval requires an authorized human manuscript author."
    });
  });

  it("enforces final intent confirmation authority for owner or corresponding author only", async () => {
    const workflow = await seedWorkflow();

    await expect(
      store.addFinalIntentApproval({
        manuscriptId: workflow.manuscript.id,
        actorId: workflow.coauthor.id
      })
    ).rejects.toThrow("Final intent confirmation requires a human project owner or corresponding author.");

    const finalApproval = await store.addFinalIntentApproval({
      manuscriptId: workflow.manuscript.id,
      actorId: workflow.owner.id,
      notes: "Owner confirms manuscript intent.",
      targetVersionId: "version_export_001",
      targetSnapshotRef: "snapshot://manuscript/001"
    });

    expect(finalApproval.approvalType).toBe("pre_export_intent_confirmation");
    expect(finalApproval.actorId).toBe(workflow.owner.id);

    const persistedApproval = await prisma.approvalEvent.findUniqueOrThrow({
      where: { id: finalApproval.id }
    });
    expect(persistedApproval.targetVersionId).toBe("version_export_001");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "approval.final_intent_confirmation",
        targetEntityType: "manuscript",
        targetEntityId: workflow.manuscript.id
      },
      orderBy: { createdAt: "desc" }
    });
    expect(audit.actorId).toBe(workflow.owner.id);
    expect(audit.targetSnapshotRef).toBe("snapshot://manuscript/001");
  });

  it("blocks export without final intent confirmation and succeeds only with the required resolved authority", async () => {
    const workflow = await seedWorkflow();
    const correspondingCookie = await createSessionCookie(workflow.correspondingAuthor.id);
    const coauthorCookie = await createSessionCookie(workflow.coauthor.id);

    await store.approveClaim(workflow.claim.id, workflow.correspondingAuthor.id);
    await store.approveClaimEvidenceLink({
      claimId: workflow.claim.id,
      evidenceId: workflow.evidence.id,
      actorId: workflow.correspondingAuthor.id
    });
    await store.approveClaimMethodLink({
      claimId: workflow.claim.id,
      methodBlockId: workflow.method.id,
      actorId: workflow.correspondingAuthor.id
    });
    await store.runReview(workflow.manuscript.id);
    await store.markClaimPublicationReady(workflow.claim.id, workflow.correspondingAuthor.id);
    await store.createSection({
      manuscriptId: workflow.manuscript.id,
      title: "Results",
      objectRefs: [
        { entityType: "claim", entityId: workflow.claim.id, orderIndex: 1 },
        { entityType: "figure", entityId: workflow.figure.id, orderIndex: 2 }
      ],
      createdBy: workflow.correspondingAuthor.id
    });

    const blockedResponse = await exportRoute.POST(
      new Request("http://localhost/api/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: correspondingCookie
        },
        body: JSON.stringify({ manuscriptId: workflow.manuscript.id, confirmFinalIntent: false })
      })
    );

    expect(blockedResponse.status).toBe(409);
    const blockedPayload = await blockedResponse.json();
    expect(blockedPayload.exportPackage.status).toBe("blocked");
    expect(blockedPayload.exportPackage.readinessReport.blockingReasons).toContain(
      "Missing pre-export final intent confirmation from a human author."
    );

    const unauthorizedFinalIntent = await exportRoute.POST(
      new Request("http://localhost/api/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: coauthorCookie
        },
        body: JSON.stringify({ manuscriptId: workflow.manuscript.id, confirmFinalIntent: true })
      })
    );

    expect(unauthorizedFinalIntent.status).toBe(409);
    await expect(unauthorizedFinalIntent.json()).resolves.toMatchObject({
      error: "Final intent confirmation requires a human project owner or corresponding author."
    });

    const successResponse = await exportRoute.POST(
      new Request("http://localhost/api/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: correspondingCookie
        },
        body: JSON.stringify({
          manuscriptId: workflow.manuscript.id,
          confirmFinalIntent: true,
          targetVersionId: "version_export_success",
          targetSnapshotRef: "snapshot://manuscript/export-success"
        })
      })
    );

    expect(successResponse.status).toBe(200);
    const successPayload = await successResponse.json();
    expect(successPayload.exportPackage.status).toBe("generated");
    expect(successPayload.exportPackage.readinessReport.canExport).toBe(true);

    const finalIntentApproval = await prisma.approvalEvent.findFirstOrThrow({
      where: {
        manuscriptId: workflow.manuscript.id,
        approvalType: "pre_export_intent_confirmation"
      },
      orderBy: { createdAt: "desc" }
    });
    expect(finalIntentApproval.actorId).toBe(workflow.correspondingAuthor.id);
  });

  it("keeps method links proposed until explicitly approved and rejects cross-manuscript evidence approvals", async () => {
    const workflow = await seedWorkflow();
    const secondManuscript = await store.createManuscript({
      projectId: workflow.project.id,
      title: "Second manuscript",
      abstract: "Used to verify manuscript-local link integrity.",
      keywords: ["integrity"],
      createdBy: workflow.owner.id
    });
    const foreignEvidence = await store.createEvidence({
      manuscriptId: secondManuscript.id,
      evidenceType: "figure",
      summary: "Foreign evidence for another manuscript.",
      createdBy: workflow.owner.id
    });

    const graphBeforeApproval = await store.getResearchObjectGraph(workflow.manuscript.id);
    const linkedMethodBeforeApproval = graphBeforeApproval.claims[0].linkedMethods.find(
      (link) => link.entityId === workflow.method.id
    );

    expect(linkedMethodBeforeApproval?.status).toBe("proposed");

    await expect(
      store.approveClaimEvidenceLink({
        claimId: workflow.claim.id,
        evidenceId: foreignEvidence.id,
        actorId: workflow.correspondingAuthor.id
      })
    ).rejects.toThrow("Claim-evidence approval requires both objects to belong to the same manuscript.");

    const methodApproval = await store.approveClaimMethodLink({
      claimId: workflow.claim.id,
      methodBlockId: workflow.method.id,
      actorId: workflow.correspondingAuthor.id
    });

    expect(methodApproval.approvalEvent.approvalType).toBe("claim_method_approval");

    const graphAfterApproval = await store.getResearchObjectGraph(workflow.manuscript.id);
    const linkedMethodAfterApproval = graphAfterApproval.claims[0].linkedMethods.find(
      (link) => link.entityId === workflow.method.id
    );

    expect(linkedMethodAfterApproval?.status).toBe("confirmed");
  });
});
