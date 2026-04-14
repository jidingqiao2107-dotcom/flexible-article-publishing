import { describe, expect, it } from "vitest";
import { buildClaimCheckResult } from "./claim-check";
import { sampleGraph, sampleClaim } from "./sample-data";
import { assessClaimValidity } from "./validity";

describe("claim check result", () => {
  it("returns structured evidence references including uploaded support assets", () => {
    const assessment = assessClaimValidity({
      graph: sampleGraph,
      claimId: sampleClaim.id,
      assessmentId: "validity_claim_check_test",
      now: "2026-04-14T10:00:00.000Z"
    });

    const result = buildClaimCheckResult({
      graph: {
        ...sampleGraph,
        validityAssessments: [assessment]
      },
      claimId: sampleClaim.id,
      assessment
    });

    expect(result.validityAssessment.claimId).toBe(sampleClaim.id);
    expect(result.evidenceReferencesUsed.some((item) => item.objectType === "support_asset")).toBe(true);
    expect(result.evidenceReferencesUsed.some((item) => item.originalFilename === "marker-b-response.png")).toBe(true);
    expect(Array.isArray(result.recommendedNextActions)).toBe(true);
  });
});
