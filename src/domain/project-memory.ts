import type {
  GroundedDiscussionAnswer,
  ProjectMemoryClaimAnalysis,
  ProjectMemorySummary,
  ResearchObjectGraph
} from "./types";

function claimScore(analysis: ProjectMemoryClaimAnalysis): number {
  return analysis.validityAssessment?.overallValidityScore ?? 0;
}

function claimBand(analysis: ProjectMemoryClaimAnalysis) {
  return analysis.validityAssessment?.scoreBand;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function contradictionReason(leftText: string, rightText: string) {
  const left = leftText.toLowerCase();
  const right = rightText.toLowerCase();
  const oppositePairs: Array<[string, string, string]> = [
    ["increase", "decrease", "One claim says the effect increases while another says it decreases."],
    ["higher", "lower", "One claim says the effect is higher while another says it is lower."],
    ["causes", "does not cause", "One claim states a causal effect while another denies it."],
    ["improves", "worsens", "One claim describes improvement while another describes worsening."]
  ];

  for (const [leftNeedle, rightNeedle, reason] of oppositePairs) {
    if ((left.includes(leftNeedle) && right.includes(rightNeedle)) || (left.includes(rightNeedle) && right.includes(leftNeedle))) {
      return reason;
    }
  }

  return null;
}

export function buildProjectMemorySummary(input: {
  projectId: string;
  graphs: ResearchObjectGraph[];
  now?: string;
}): ProjectMemorySummary {
  const claimAnalyses: ProjectMemoryClaimAnalysis[] = input.graphs.flatMap((graph) =>
    graph.claims.map((claim) => {
      const validityAssessment = graph.validityAssessments?.find((item) => item.claimId === claim.id);
      const trustReadiness =
        graph.claimTrustReadiness?.find((item) => item.claimId === claim.id) ??
        (() => {
          throw new Error(`Missing trust contract for claim ${claim.id}.`);
        })();
      const evidenceIds = claim.linkedEvidence.map((link) => link.evidenceId);
      const figureIds = claim.sourceFigures.map((link) => link.entityId).filter(Boolean) as string[];
      const methodIds = claim.linkedMethods.map((link) => link.entityId).filter(Boolean) as string[];
      const limitationIds = claim.linkedLimitations.map((link) => link.entityId).filter(Boolean) as string[];
      const citationIds = claim.linkedCitations.map((link) => link.entityId).filter(Boolean) as string[];
      const noteIds = graph.evidence
        .filter((item) => item.evidenceType === "note" && evidenceIds.includes(item.id))
        .map((item) => item.id);

      return {
        claimId: claim.id,
        manuscriptId: graph.manuscript.id,
        manuscriptTitle: graph.manuscript.title,
        claimText: claim.text,
        claimType: claim.claimType,
        strengthLevel: claim.strengthLevel,
        authorConfirmed: claim.authorApproved,
        aiSuggested: claim.createdBy.startsWith("ai_"),
        supportBundle: {
          evidenceIds,
          figureIds,
          methodIds,
          limitationIds,
          citationIds,
          noteIds
        },
        unresolvedSupportGaps: trustReadiness.blockers.map((item) => item.message),
        majorConcerns: validityAssessment?.majorConcerns ?? [],
        suggestedNextActions: uniqueStrings([
          ...(validityAssessment?.suggestedNextActions ?? []),
          ...trustReadiness.blockers.map((item) => item.message)
        ]),
        validityAssessment,
        trustReadiness
      };
    })
  );

  const strongestClaims = [...claimAnalyses]
    .sort((left, right) => claimScore(right) - claimScore(left))
    .slice(0, 5)
    .map((analysis) => ({
      claimId: analysis.claimId,
      manuscriptId: analysis.manuscriptId,
      claimText: analysis.claimText,
      score: claimScore(analysis),
      scoreBand: claimBand(analysis)
    }));

  const weakestClaims = [...claimAnalyses]
    .sort((left, right) => claimScore(left) - claimScore(right))
    .slice(0, 5)
    .map((analysis) => ({
      claimId: analysis.claimId,
      manuscriptId: analysis.manuscriptId,
      claimText: analysis.claimText,
      score: claimScore(analysis),
      scoreBand: claimBand(analysis)
    }));

  const unresolvedContradictions = claimAnalyses.flatMap((left, leftIndex) =>
    claimAnalyses.slice(leftIndex + 1).flatMap((right) => {
      const reason = contradictionReason(left.claimText, right.claimText);
      return reason
        ? [
            {
              leftClaimId: left.claimId,
              rightClaimId: right.claimId,
              reason
            }
          ]
        : [];
    })
  );

  return {
    projectId: input.projectId,
    manuscripts: input.graphs.map((graph) => ({ id: graph.manuscript.id, title: graph.manuscript.title })),
    claimAnalyses,
    strongestClaims,
    weakestClaims,
    weakestClaims: weakestClaims,
    claimsMissingSupport: claimAnalyses
      .filter((analysis) => analysis.unresolvedSupportGaps.length > 0)
      .map((analysis) => ({
        claimId: analysis.claimId,
        manuscriptId: analysis.manuscriptId,
        claimText: analysis.claimText,
        gaps: analysis.unresolvedSupportGaps
      })),
    unresolvedContradictions,
    authorConfirmedClaimIds: claimAnalyses.filter((analysis) => analysis.authorConfirmed).map((analysis) => analysis.claimId),
    aiSuggestedClaimIds: claimAnalyses.filter((analysis) => analysis.aiSuggested).map((analysis) => analysis.claimId),
    lastDigestedAt: input.now ?? new Date().toISOString()
  };
}

function findAnalyses(memory: ProjectMemorySummary, claimIds?: string[]) {
  if (!claimIds?.length) {
    return memory.claimAnalyses;
  }

  return memory.claimAnalyses.filter((analysis) => claimIds.includes(analysis.claimId));
}

function conservativeRewrite(text: string) {
  if (text.toLowerCase().startsWith("treatment")) {
    return `The observed data suggest that ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  return `The available evidence suggests that ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

export function answerGroundedDiscussion(input: {
  memory: ProjectMemorySummary;
  question: string;
  claimIds?: string[];
}): GroundedDiscussionAnswer {
  const question = input.question.trim();
  const lowered = question.toLowerCase();
  const relevantAnalyses = findAnalyses(input.memory, input.claimIds);
  const primary = relevantAnalyses[0];

  if (lowered.includes("strongest")) {
    return {
      mode: "memory_summary",
      question,
      answer:
        input.memory.strongestClaims.length > 0
          ? input.memory.strongestClaims
              .map((claim, index) => `${index + 1}. ${claim.claimText} (${claim.scoreBand ?? "unassessed"} ${claim.score})`)
              .join("\n")
          : "No claims have been analyzed strongly enough to rank yet.",
      referencedClaimIds: input.memory.strongestClaims.map((claim) => claim.claimId),
      groundingNotes: ["Ranked by the latest stored claim validity assessments in project memory."],
      suggestedFollowUps: ["Ask why a specific claim is only moderate validity.", "Ask what support is still missing for a claim."]
    };
  }

  if (lowered.includes("weakest")) {
    return {
      mode: "memory_summary",
      question,
      answer:
        input.memory.weakestClaims.length > 0
          ? input.memory.weakestClaims
              .map((claim, index) => `${index + 1}. ${claim.claimText} (${claim.scoreBand ?? "unassessed"} ${claim.score})`)
              .join("\n")
          : "No claims are available to rank yet.",
      referencedClaimIds: input.memory.weakestClaims.map((claim) => claim.claimId),
      groundingNotes: ["Ranked by the latest stored claim validity assessments in project memory."],
      suggestedFollowUps: ["Ask what support is missing for the weakest claim.", "Compare one weak claim with a stronger claim."]
    };
  }

  if ((lowered.includes("why") || lowered.includes("validity")) && primary) {
    return {
      mode: "claim_explanation",
      question,
      answer: primary.validityAssessment
        ? `${primary.claimText}\n\nValidity: ${primary.validityAssessment.scoreBand} (${primary.validityAssessment.overallValidityScore}). ${primary.validityAssessment.summaryForUser}`
        : "This claim does not have a validity assessment yet.",
      referencedClaimIds: [primary.claimId],
      groundingNotes: uniqueStrings([
        ...(primary.majorConcerns.length ? primary.majorConcerns : ["No major concerns were stored for this claim."])
      ]),
      suggestedFollowUps: primary.suggestedNextActions.slice(0, 3)
    };
  }

  if ((lowered.includes("missing support") || lowered.includes("support is missing")) && primary) {
    return {
      mode: "missing_support",
      question,
      answer:
        primary.unresolvedSupportGaps.length > 0
          ? primary.unresolvedSupportGaps.join(" ")
          : "This claim is structurally complete in the current trust/readiness contract, even if validity may still be weak.",
      referencedClaimIds: [primary.claimId],
      groundingNotes: primary.trustReadiness.blockers.map((item) => item.message),
      suggestedFollowUps: primary.suggestedNextActions.slice(0, 3)
    };
  }

  if (lowered.includes("compare") && relevantAnalyses.length >= 2) {
    const [left, right] = relevantAnalyses;
    return {
      mode: "claim_comparison",
      question,
      answer: [
        `${left.claimText}`,
        `Validity: ${left.validityAssessment?.scoreBand ?? "unassessed"} (${left.validityAssessment?.overallValidityScore ?? 0}), trust state: ${left.trustReadiness.lifecycleState}.`,
        "",
        `${right.claimText}`,
        `Validity: ${right.validityAssessment?.scoreBand ?? "unassessed"} (${right.validityAssessment?.overallValidityScore ?? 0}), trust state: ${right.trustReadiness.lifecycleState}.`
      ].join("\n"),
      referencedClaimIds: [left.claimId, right.claimId],
      groundingNotes: [
        `Left support bundle: ${left.supportBundle.evidenceIds.length} evidence, ${left.supportBundle.methodIds.length} methods.`,
        `Right support bundle: ${right.supportBundle.evidenceIds.length} evidence, ${right.supportBundle.methodIds.length} methods.`
      ],
      suggestedFollowUps: ["Ask what support is missing for the weaker claim.", "Ask for a more conservative rewrite of one claim."]
    };
  }

  if ((lowered.includes("results paragraph") || lowered.includes("draft a results paragraph")) && primary) {
    const evidenceSummaries = primary.supportBundle.evidenceIds
      .slice(0, 2)
      .map((evidenceId) => {
        const analysis = input.memory.claimAnalyses.find((item) => item.claimId === primary.claimId);
        return analysis ? evidenceId : evidenceId;
      });

    return {
      mode: "results_paragraph",
      question,
      answer: `In ${primary.manuscriptTitle}, ${primary.claimText.toLowerCase()} This statement is currently supported by ${primary.supportBundle.evidenceIds.length} linked evidence item(s) and ${primary.supportBundle.methodIds.length} linked method block(s). ${primary.majorConcerns[0] ? `A key caution is that ${primary.majorConcerns[0].charAt(0).toLowerCase()}${primary.majorConcerns[0].slice(1)}` : ""}`.trim(),
      referencedClaimIds: [primary.claimId],
      groundingNotes: uniqueStrings([
        `Evidence links: ${primary.supportBundle.evidenceIds.join(", ") || "none"}`,
        `Method links: ${primary.supportBundle.methodIds.join(", ") || "none"}`,
        ...evidenceSummaries
      ]),
      suggestedFollowUps: ["Rewrite this paragraph more conservatively.", "Ask what support is still missing."]
    };
  }

  if ((lowered.includes("rewrite") || lowered.includes("conservative")) && primary) {
    return {
      mode: "conservative_rewrite",
      question,
      answer: conservativeRewrite(primary.claimText),
      referencedClaimIds: [primary.claimId],
      groundingNotes: [
        `Original claim strength: ${primary.strengthLevel}`,
        `Current validity: ${primary.validityAssessment?.scoreBand ?? "unassessed"}`
      ],
      suggestedFollowUps: ["Ask why the current validity is not higher.", "Ask what support would strengthen this rewrite."]
    };
  }

  return {
    mode: "unsupported_question",
    question,
    answer:
      "This prototype only answers grounded project-memory questions right now. Try asking about strongest claims, weakest claims, missing support, claim comparison, a results paragraph, or a conservative rewrite.",
    referencedClaimIds: [],
    groundingNotes: ["The response engine is limited to deterministic project-memory queries in this prototype."],
    suggestedFollowUps: [
      "What are the strongest claims?",
      "Why is this claim only moderate validity?",
      "What support is missing for this claim?"
    ]
  };
}
