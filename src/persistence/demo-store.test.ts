import { beforeEach, describe, expect, it } from "vitest";
import {
  createClaim,
  createSupportAsset,
  createEvidence,
  getClaimCheckResult,
  getResearchObjectGraph,
  resetDevelopmentQaData,
  runClaimCheck,
  updateSupportAssetClaimMapping
} from "./demo-store";

describe("demo claim-check store", () => {
  beforeEach(async () => {
    await resetDevelopmentQaData();
  });

  it("lets one uploaded support object map to multiple claims", async () => {
    const graph = await getResearchObjectGraph("manuscript_demo_founder");
    const newClaim = await createClaim({
      manuscriptId: graph.manuscript.id,
      text: "Treatment A shifted marker B in a follow-up exploratory cohort."
    });

    const asset = graph.supportAssets?.find((item) => item.id === "support_asset_demo_image");
    expect(asset).toBeTruthy();

    await updateSupportAssetClaimMapping({
      manuscriptId: graph.manuscript.id,
      supportAssetId: asset!.id,
      claimId: newClaim.id,
      status: "proposed",
      actorId: "author_demo_corresponding"
    });

    const refreshed = await getResearchObjectGraph(graph.manuscript.id);
    const mappedAsset = refreshed.supportAssets?.find((item) => item.id === asset!.id);

    expect(mappedAsset?.linkedClaimIds).toContain("claim_demo_001");
    expect(mappedAsset?.linkedClaimIds).toContain(newClaim.id);
  });

  it("stores a claim-check result that includes uploaded support references", async () => {
    const graph = await getResearchObjectGraph("manuscript_demo_founder");
    const evidence = await createEvidence({
      manuscriptId: graph.manuscript.id,
      evidenceType: "dataset",
      summary: "Uploaded dataset summary for a new claim.",
      createdBy: "author_demo_corresponding"
    });
    const asset = await createSupportAsset({
      manuscriptId: graph.manuscript.id,
      supportCategory: "data",
      fileType: "text/csv",
      originalFilename: "follow-up-dataset.csv",
      storageKey: "follow_up_dataset.csv",
      sizeBytes: 128,
      contentDigest: "digest_follow_up_dataset",
      textPreview: "group,value\nfollowup,1.2",
      extractedText: "group,value\nfollowup,1.2",
      derivedEntityType: "evidence",
      derivedEntityId: evidence.id,
      createdBy: "author_demo_corresponding"
    });
    const claim = await createClaim({
      manuscriptId: graph.manuscript.id,
      text: "Treatment A was associated with a follow-up change in marker B."
    });

    await updateSupportAssetClaimMapping({
      manuscriptId: graph.manuscript.id,
      supportAssetId: asset.id,
      claimId: claim.id,
      status: "confirmed",
      actorId: "author_demo_corresponding"
    });

    const result = await runClaimCheck({ manuscriptId: graph.manuscript.id, claimId: claim.id });
    const latest = await getClaimCheckResult({ manuscriptId: graph.manuscript.id, claimId: claim.id });

    expect(result.claimId).toBe(claim.id);
    expect(result.evidenceReferencesUsed.some((item) => item.originalFilename === "follow-up-dataset.csv")).toBe(true);
    expect(latest?.validityAssessment.assessmentId).toBe(result.validityAssessment.assessmentId);
  });
});
