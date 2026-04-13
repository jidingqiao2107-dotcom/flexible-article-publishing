import type {
  ClaimFramingAssessment,
  ClaimFramingSourceMode,
  ClaimType,
  DiscussionRequestedMode,
  StrengthLevel
} from "@/domain/types";

type ClaimFramingDraft = {
  suggestedClaimType: ClaimType;
  suggestedStrengthLevel: StrengthLevel;
  rationale: string;
  cues: string[];
  modelConfidence: number;
};

const DEFAULT_OPENAI_MODEL = "gpt-5";
const DEFAULT_OPENAI_API_BASE = "https://api.openai.com/v1";

function getOpenAiFramingConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_CLAIM_FRAMING_MODEL || process.env.OPENAI_DISCUSSION_MODEL || DEFAULT_OPENAI_MODEL,
    apiBaseUrl: process.env.OPENAI_API_BASE_URL || DEFAULT_OPENAI_API_BASE
  };
}

function inferDeterministicClaimType(text: string): ClaimType {
  const lowered = text.toLowerCase();

  if (/\bwe hypothesize\b|\bmay\b|\bcould\b|\bmight\b|\bpropose\b/.test(lowered)) {
    return "hypothesis";
  }

  if (/\bmechanism\b|\bpathway\b|\bmediated by\b|\bdriven by\b|\bthrough\b/.test(lowered)) {
    return "mechanism";
  }

  if (/\bsuggests\b|\bindicates\b|\bconsistent with\b|\bimplies\b/.test(lowered)) {
    return "interpretation";
  }

  if (/\bconclude\b|\btherefore\b|\bdemonstrates\b|\bshows that\b/.test(lowered)) {
    return "conclusion";
  }

  if (/\bknown\b|\bpreviously\b|\breported\b|\bin the literature\b/.test(lowered)) {
    return "background";
  }

  return "observation";
}

function inferDeterministicStrength(text: string): StrengthLevel {
  const lowered = text.toLowerCase();

  if (/\bmay\b|\bcould\b|\bmight\b|\bpreliminary\b|\bexploratory\b/.test(lowered)) {
    return "exploratory";
  }

  if (/\bassociated with\b|\blinked to\b|\bwas observed\b|\bsuggests\b/.test(lowered)) {
    return "moderate";
  }

  if (/\bcauses\b|\bdemonstrates\b|\bestablishes\b|\bproves\b/.test(lowered)) {
    return "strong";
  }

  return "moderate";
}

function deterministicClaimFraming(text: string): ClaimFramingDraft {
  const suggestedClaimType = inferDeterministicClaimType(text);
  const suggestedStrengthLevel = inferDeterministicStrength(text);
  const cues = [
    suggestedClaimType === "mechanism" ? "Detected mechanistic wording." : "",
    suggestedClaimType === "interpretation" ? "Detected interpretive or inferential wording." : "",
    suggestedClaimType === "hypothesis" ? "Detected tentative or hypothetical wording." : "",
    suggestedStrengthLevel === "strong" ? "Detected assertive causal or high-certainty language." : "",
    suggestedStrengthLevel === "exploratory" ? "Detected tentative or exploratory language." : ""
  ].filter(Boolean);

  return {
    suggestedClaimType,
    suggestedStrengthLevel,
    rationale: `The claim was framed as ${suggestedClaimType} with ${suggestedStrengthLevel} strength based on the wording currently present in the claim text.`,
    cues,
    modelConfidence: 0.62
  };
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    const content = item && typeof item === "object" ? (item as { content?: unknown }).content : undefined;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typedPart = part as { type?: unknown; text?: unknown };
      if (typedPart.type === "output_text" && typeof typedPart.text === "string" && typedPart.text.trim()) {
        return typedPart.text;
      }
    }
  }

  return null;
}

async function createOpenAiClaimFraming(text: string): Promise<ClaimFramingDraft> {
  const config = getOpenAiFramingConfig();

  if (!config.apiKey) {
    throw new Error("OpenAI claim framing mode is not configured.");
  }

  const response = await fetch(`${config.apiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Classify the scientific claim text only. Return the best-fitting claim type and strength level. Do not decide approval, truth, readiness, or publication state."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                claimText: text,
                allowedClaimTypes: ["observation", "interpretation", "mechanism", "hypothesis", "conclusion", "background"],
                allowedStrengthLevels: ["weak", "moderate", "strong", "exploratory"]
              })
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "claim_framing_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              suggestedClaimType: {
                type: "string",
                enum: ["observation", "interpretation", "mechanism", "hypothesis", "conclusion", "background"]
              },
              suggestedStrengthLevel: {
                type: "string",
                enum: ["weak", "moderate", "strong", "exploratory"]
              },
              rationale: { type: "string" },
              cues: {
                type: "array",
                items: { type: "string" }
              },
              modelConfidence: { type: "number" }
            },
            required: ["suggestedClaimType", "suggestedStrengthLevel", "rationale", "cues", "modelConfidence"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI claim framing request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error("OpenAI claim framing response did not include structured output text.");
  }

  return JSON.parse(outputText) as ClaimFramingDraft;
}

export async function generateClaimFramingAssessment(input: {
  manuscriptId: string;
  claimId: string;
  text: string;
  basedOnSnapshotRef: string;
  requestedMode?: DiscussionRequestedMode;
  generatedAt?: string;
}): Promise<ClaimFramingAssessment> {
  const requestedMode = input.requestedMode ?? "auto";
  const llmAvailable = Boolean(getOpenAiFramingConfig().apiKey);
  const shouldUseLlm = requestedMode === "llm" || (requestedMode === "auto" && llmAvailable);

  let draft: ClaimFramingDraft;
  let sourceMode: ClaimFramingSourceMode;

  if (shouldUseLlm) {
    try {
      draft = await createOpenAiClaimFraming(input.text);
      sourceMode = "llm_claim_framing_v1";
    } catch {
      draft = deterministicClaimFraming(input.text);
      sourceMode = "deterministic_claim_framing_v1";
    }
  } else {
    draft = deterministicClaimFraming(input.text);
    sourceMode = "deterministic_claim_framing_v1";
  }

  return {
    assessmentId: `claim_framing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "claim_framing_assessment",
    manuscriptId: input.manuscriptId,
    claimId: input.claimId,
    suggestedClaimType: draft.suggestedClaimType,
    suggestedStrengthLevel: draft.suggestedStrengthLevel,
    rationale: draft.rationale,
    cues: draft.cues,
    modelConfidence: draft.modelConfidence,
    sourceMode,
    basedOnSnapshotRef: input.basedOnSnapshotRef,
    basedOnClaimText: input.text,
    generatedAt: input.generatedAt ?? new Date().toISOString()
  };
}
