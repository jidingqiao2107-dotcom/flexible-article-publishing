import { describe, expect, it } from "vitest";
import { sampleGraph, unsupportedClaim } from "@/domain/sample-data";
import { runDeterministicAiReview } from "./rules";

describe("deterministic AI review rules", () => {
  it("flags unsupported claims as blocking structured review results", () => {
    const results = runDeterministicAiReview({
      ...sampleGraph,
      claims: [unsupportedClaim],
      figures: []
    });

    const unsupported = results.find((result) => result.ruleId === "claim.unsupported");

    expect(unsupported).toMatchObject({
      type: "ai_review_result",
      severity: "blocking",
      linkedEntityIds: [unsupportedClaim.id],
      resolutionStatus: "open",
      modelActionType: "deterministic_rule_check"
    });
  });

  it("flags unreviewed AI provenance as blocking", () => {
    const results = runDeterministicAiReview({
      ...sampleGraph,
      provenance: [
        {
          id: "prov_001",
          type: "provenance_record",
          manuscriptId: sampleGraph.manuscript.id,
          targetEntityType: "claim",
          targetEntityId: sampleGraph.claims[0].id,
          sourceObjectIds: ["evidence_001"],
          modelActionType: "draft_section",
          authorApprovalStatus: "pending",
          createdAt: "2026-04-07T09:00:00.000Z"
        }
      ]
    });

    expect(results.some((result) => result.ruleId === "version.unreviewed_ai_edit")).toBe(true);
  });
});

