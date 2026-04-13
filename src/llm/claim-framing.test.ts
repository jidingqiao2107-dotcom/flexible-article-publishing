import { afterEach, describe, expect, it, vi } from "vitest";

import { generateClaimFramingAssessment } from "./claim-framing";

const originalApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  process.env.OPENAI_API_KEY = originalApiKey;
  vi.restoreAllMocks();
});

describe("generateClaimFramingAssessment", () => {
  it("uses deterministic framing when no LLM is configured", async () => {
    delete process.env.OPENAI_API_KEY;

    const assessment = await generateClaimFramingAssessment({
      manuscriptId: "manuscript_001",
      claimId: "claim_001",
      text: "Treatment A may reduce marker B in the study cohort.",
      basedOnSnapshotRef: "snapshot://claim/001"
    });

    expect(assessment.sourceMode).toBe("deterministic_claim_framing_v1");
    expect(assessment.suggestedClaimType).toBe("hypothesis");
    expect(assessment.suggestedStrengthLevel).toBe("exploratory");
  });

  it("uses OpenAI framing when requested and configured", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            suggestedClaimType: "mechanism",
            suggestedStrengthLevel: "strong",
            rationale: "The wording makes a mechanistic and assertive claim.",
            cues: ["Detected mechanism wording.", "Detected strong certainty language."],
            modelConfidence: 0.88
          })
        })
      })
    );

    const assessment = await generateClaimFramingAssessment({
      manuscriptId: "manuscript_001",
      claimId: "claim_001",
      text: "Treatment A drives marker B reduction through pathway C.",
      basedOnSnapshotRef: "snapshot://claim/001",
      requestedMode: "llm"
    });

    expect(assessment.sourceMode).toBe("llm_claim_framing_v1");
    expect(assessment.suggestedClaimType).toBe("mechanism");
    expect(assessment.suggestedStrengthLevel).toBe("strong");
  });

  it("falls back to deterministic framing when the OpenAI request fails", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })
    );

    const assessment = await generateClaimFramingAssessment({
      manuscriptId: "manuscript_001",
      claimId: "claim_001",
      text: "Treatment A suggests marker B reduction in the study cohort.",
      basedOnSnapshotRef: "snapshot://claim/001",
      requestedMode: "llm"
    });

    expect(assessment.sourceMode).toBe("deterministic_claim_framing_v1");
    expect(assessment.suggestedClaimType).toBe("interpretation");
    expect(assessment.suggestedStrengthLevel).toBe("moderate");
  });
});
