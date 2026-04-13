import { answerGroundedDiscussion } from "@/domain/project-memory";
import type {
  DiscussionRequestedMode,
  GroundedDiscussionAnswer,
  ProjectMemorySummary
} from "@/domain/types";

type OpenAiDiscussionConfig = {
  apiKey?: string;
  model: string;
  apiBaseUrl: string;
};

type ModelDiscussionDraft = {
  answer: string;
  groundingNotes: string[];
  suggestedFollowUps: string[];
};

const DEFAULT_OPENAI_MODEL = "gpt-5";
const DEFAULT_OPENAI_API_BASE = "https://api.openai.com/v1";

function getOpenAiDiscussionConfig(): OpenAiDiscussionConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_DISCUSSION_MODEL || DEFAULT_OPENAI_MODEL,
    apiBaseUrl: process.env.OPENAI_API_BASE_URL || DEFAULT_OPENAI_API_BASE
  };
}

function buildDiscussionPrompt(input: {
  memory: ProjectMemorySummary;
  question: string;
  claimIds?: string[];
  deterministicAnswer: GroundedDiscussionAnswer;
  priorTurns?: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const focusClaims = input.memory.claimAnalyses
    .filter((analysis) => (input.claimIds?.length ? input.claimIds.includes(analysis.claimId) : true))
    .slice(0, 6)
    .map((analysis) => ({
      claimId: analysis.claimId,
      manuscriptTitle: analysis.manuscriptTitle,
      claimText: analysis.claimText,
      claimType: analysis.claimType,
      strengthLevel: analysis.strengthLevel,
      validity: analysis.validityAssessment
        ? {
            score: analysis.validityAssessment.overallValidityScore,
            band: analysis.validityAssessment.scoreBand,
            summary: analysis.validityAssessment.summaryForUser,
            concerns: analysis.validityAssessment.majorConcerns
          }
        : null,
      trust: {
        lifecycleState: analysis.trustReadiness.lifecycleState,
        blockers: analysis.trustReadiness.blockers.map((item) => item.message),
        warnings: analysis.trustReadiness.warnings.map((item) => item.message)
      },
      supportBundle: {
        evidenceIds: analysis.supportBundle.evidenceIds,
        figureIds: analysis.supportBundle.figureIds,
        methodIds: analysis.supportBundle.methodIds,
        limitationIds: analysis.supportBundle.limitationIds,
        citationIds: analysis.supportBundle.citationIds,
        noteIds: analysis.supportBundle.noteIds
      },
      suggestedNextActions: analysis.suggestedNextActions
    }));

  return {
    question: input.question,
    priorTurns: input.priorTurns?.slice(-6) ?? [],
    deterministicMode: input.deterministicAnswer.mode,
    deterministicAnswer: {
      answer: input.deterministicAnswer.answer,
      groundingNotes: input.deterministicAnswer.groundingNotes,
      suggestedFollowUps: input.deterministicAnswer.suggestedFollowUps,
      referencedClaimIds: input.deterministicAnswer.referencedClaimIds,
      usedMemoryObjectIds: input.deterministicAnswer.usedMemoryObjectIds
    },
    projectMemory: {
      strongestClaims: input.memory.strongestClaims.slice(0, 5),
      weakestClaims: input.memory.weakestClaims.slice(0, 5),
      claimsMissingSupport: input.memory.claimsMissingSupport.slice(0, 5),
      unresolvedContradictions: input.memory.unresolvedContradictions.slice(0, 5),
      focusClaims
    }
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

async function createOpenAiDiscussionDraft(input: {
  memory: ProjectMemorySummary;
  question: string;
  claimIds?: string[];
  deterministicAnswer: GroundedDiscussionAnswer;
  priorTurns?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ModelDiscussionDraft> {
  const config = getOpenAiDiscussionConfig();

  if (!config.apiKey) {
    throw new Error("OpenAI discussion mode is not configured.");
  }

  const promptPayload = buildDiscussionPrompt(input);
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
                "You are a grounded scientific discussion assistant. Use only the provided project memory. Do not invent support, approvals, readiness, publication state, or export permission. Keep validity, trust/readiness, approval, and export as separate concepts. Return concise, careful, claim-aware prose."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(promptPayload)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "grounded_discussion_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: { type: "string" },
              groundingNotes: {
                type: "array",
                items: { type: "string" }
              },
              suggestedFollowUps: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["answer", "groundingNotes", "suggestedFollowUps"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI discussion request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error("OpenAI discussion response did not include structured output text.");
  }

  const parsed = JSON.parse(outputText) as Partial<ModelDiscussionDraft>;
  return {
    answer: typeof parsed.answer === "string" ? parsed.answer : input.deterministicAnswer.answer,
    groundingNotes: Array.isArray(parsed.groundingNotes)
      ? parsed.groundingNotes.filter((item): item is string => typeof item === "string")
      : input.deterministicAnswer.groundingNotes,
    suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
      ? parsed.suggestedFollowUps.filter((item): item is string => typeof item === "string")
      : input.deterministicAnswer.suggestedFollowUps
  };
}

export async function generateGroundedDiscussion(input: {
  memory: ProjectMemorySummary;
  question: string;
  claimIds?: string[];
  requestedMode?: DiscussionRequestedMode;
  priorTurns?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<GroundedDiscussionAnswer> {
  const deterministicAnswer = answerGroundedDiscussion({
    memory: input.memory,
    question: input.question,
    claimIds: input.claimIds
  });

  const requestedMode = input.requestedMode ?? "auto";
  const config = getOpenAiDiscussionConfig();
  const llmAvailable = Boolean(config.apiKey);
  const shouldUseLlm =
    requestedMode === "llm" || (requestedMode === "auto" && llmAvailable);

  if (!shouldUseLlm) {
    return requestedMode === "deterministic"
      ? deterministicAnswer
      : {
          ...deterministicAnswer,
          fallbackReason: llmAvailable ? undefined : "No OpenAI API key configured; using deterministic discussion mode."
        };
  }

  try {
    const llmDraft = await createOpenAiDiscussionDraft({
      memory: input.memory,
      question: input.question,
      claimIds: input.claimIds,
      deterministicAnswer,
      priorTurns: input.priorTurns
    });

    return {
      ...deterministicAnswer,
      sourceMode: "llm_openai_responses_v1",
      answer: llmDraft.answer,
      groundingNotes: llmDraft.groundingNotes,
      suggestedFollowUps: llmDraft.suggestedFollowUps
    };
  } catch (error) {
    return {
      ...deterministicAnswer,
      fallbackReason:
        error instanceof Error
          ? `LLM discussion fell back to deterministic mode: ${error.message}`
          : "LLM discussion fell back to deterministic mode."
    };
  }
}
