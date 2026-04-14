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
    ["increase", "reduction", "One claim says the effect increases while another describes a reduction."],
    ["increase", "reduced", "One claim says the effect increases while another says it was reduced."],
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
      const evidenceIds = claim.linkedEvidence.filter((link) => link.status !== "rejected").map((link) => link.evidenceId);
      const figureIds = claim.sourceFigures.filter((link) => link.status !== "rejected").map((link) => link.entityId).filter(Boolean) as string[];
      const supportAssetIds = uniqueStrings([
        ...graph.evidence
          .filter((item) => evidenceIds.includes(item.id))
          .flatMap((item) => item.linkedAssetIds),
        ...graph.figures
          .filter((item) => figureIds.includes(item.id))
          .flatMap((item) => item.uploadedAssetIds)
      ]);
      const methodIds = claim.linkedMethods.filter((link) => link.status !== "rejected").map((link) => link.entityId).filter(Boolean) as string[];
      const limitationIds = claim.linkedLimitations.filter((link) => link.status !== "rejected").map((link) => link.entityId).filter(Boolean) as string[];
      const citationIds = claim.linkedCitations.filter((link) => link.status !== "rejected").map((link) => link.entityId).filter(Boolean) as string[];
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
          supportAssetIds,
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

function deriveFocus(claimIds?: string[]): GroundedDiscussionAnswer["focus"] {
  if ((claimIds?.length ?? 0) >= 2) {
    return {
      scope: "comparison",
      primaryClaimId: claimIds?.[0],
      comparisonClaimId: claimIds?.[1]
    };
  }

  if ((claimIds?.length ?? 0) === 1) {
    return {
      scope: "claim",
      primaryClaimId: claimIds?.[0]
    };
  }

  return { scope: "project" };
}

function buildGroundedContext(
  memory: ProjectMemorySummary,
  analyses: ProjectMemoryClaimAnalysis[]
): GroundedDiscussionAnswer["groundedContext"] {
  const claimIds = analyses.map((analysis) => analysis.claimId);
  const contradictions = memory.unresolvedContradictions.filter(
    (item) => claimIds.includes(item.leftClaimId) || claimIds.includes(item.rightClaimId)
  );
  const memorySignals = uniqueStrings([
    ...analyses.flatMap((analysis) =>
      memory.strongestClaims.some((claim) => claim.claimId === analysis.claimId)
        ? [`${analysis.claimText} is currently ranked among the strongest remembered claims.`]
        : []
    ),
    ...analyses.flatMap((analysis) =>
      memory.weakestClaims.some((claim) => claim.claimId === analysis.claimId)
        ? [`${analysis.claimText} is currently ranked among the weakest remembered claims.`]
        : []
    ),
    ...analyses.flatMap((analysis) =>
      memory.claimsMissingSupport.some((claim) => claim.claimId === analysis.claimId)
        ? [`${analysis.claimText} is still missing required support in the trust contract.`]
        : []
    ),
    ...contradictions.map((item) => item.reason)
  ]);

  return {
    claims: analyses.map((analysis) => ({
      claimId: analysis.claimId,
      manuscriptId: analysis.manuscriptId,
      manuscriptTitle: analysis.manuscriptTitle,
      claimText: analysis.claimText,
      claimType: analysis.claimType,
      strengthLevel: analysis.strengthLevel,
      validityScore: analysis.validityAssessment?.overallValidityScore,
      validityBand: analysis.validityAssessment?.scoreBand,
      trustLifecycleState: analysis.trustReadiness.lifecycleState,
      supportCounts: {
        evidence: analysis.supportBundle.evidenceIds.length,
        figures: analysis.supportBundle.figureIds.length,
        methods: analysis.supportBundle.methodIds.length,
        limitations: analysis.supportBundle.limitationIds.length,
        citations: analysis.supportBundle.citationIds.length,
        notes: analysis.supportBundle.noteIds.length
      },
      majorConcerns: analysis.majorConcerns,
      unresolvedSupportGaps: analysis.unresolvedSupportGaps
    })),
    memorySignals,
    contradictions
  };
}

function analysesForClaimIds(memory: ProjectMemorySummary, claimIds: string[]) {
  return memory.claimAnalyses.filter((analysis) => claimIds.includes(analysis.claimId));
}

function collectUsedMemoryObjectIds(analyses: ProjectMemoryClaimAnalysis[]) {
  return uniqueStrings(
    analyses.flatMap((analysis) => [
      analysis.claimId,
      ...analysis.supportBundle.supportAssetIds,
      ...analysis.supportBundle.evidenceIds,
      ...analysis.supportBundle.figureIds,
      ...analysis.supportBundle.methodIds,
      ...analysis.supportBundle.limitationIds,
      ...analysis.supportBundle.citationIds,
      ...analysis.supportBundle.noteIds
    ])
  );
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
  const focus = deriveFocus(input.claimIds);
  const claimContext = buildGroundedContext(input.memory, relevantAnalyses.length ? relevantAnalyses : primary ? [primary] : []);
  const projectContext = buildGroundedContext(input.memory, input.memory.claimAnalyses.slice(0, 5));

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
      sourceMode: "deterministic_discussion_contract_v1",
      focus,
      referencedClaimIds: input.memory.strongestClaims.map((claim) => claim.claimId),
      usedMemoryObjectIds: collectUsedMemoryObjectIds(
        analysesForClaimIds(
          input.memory,
          input.memory.strongestClaims.map((claim) => claim.claimId)
        )
      ),
      groundingNotes: ["Ranked by the latest stored claim validity assessments in project memory."],
      suggestedFollowUps: ["Ask why a specific claim is only moderate validity.", "Ask what support is still missing for a claim."],
      groundedContext: buildGroundedContext(
        input.memory,
        analysesForClaimIds(
          input.memory,
          input.memory.strongestClaims.map((claim) => claim.claimId)
        )
      )
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
      sourceMode: "deterministic_discussion_contract_v1",
      focus,
      referencedClaimIds: input.memory.weakestClaims.map((claim) => claim.claimId),
      usedMemoryObjectIds: collectUsedMemoryObjectIds(
        analysesForClaimIds(
          input.memory,
          input.memory.weakestClaims.map((claim) => claim.claimId)
        )
      ),
      groundingNotes: ["Ranked by the latest stored claim validity assessments in project memory."],
      suggestedFollowUps: ["Ask what support is missing for the weakest claim.", "Compare one weak claim with a stronger claim."],
      groundedContext: buildGroundedContext(
        input.memory,
        analysesForClaimIds(
          input.memory,
          input.memory.weakestClaims.map((claim) => claim.claimId)
        )
      )
    };
  }

  if ((lowered.includes("why") || lowered.includes("validity")) && primary) {
    return {
      mode: "claim_explanation",
      question,
      answer: primary.validityAssessment
        ? `${primary.claimText}\n\nValidity: ${primary.validityAssessment.scoreBand} (${primary.validityAssessment.overallValidityScore}). ${primary.validityAssessment.summaryForUser}`
        : "This claim does not have a validity assessment yet.",
      sourceMode: "deterministic_discussion_contract_v1",
      focus,
      referencedClaimIds: [primary.claimId],
      usedMemoryObjectIds: collectUsedMemoryObjectIds([primary]),
      groundingNotes: uniqueStrings([
        ...(primary.majorConcerns.length ? primary.majorConcerns : ["No major concerns were stored for this claim."])
      ]),
      suggestedFollowUps: primary.suggestedNextActions.slice(0, 3),
      groundedContext: claimContext
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
      sourceMode: "deterministic_discussion_contract_v1",
      focus,
      referencedClaimIds: [primary.claimId],
      usedMemoryObjectIds: collectUsedMemoryObjectIds([primary]),
      groundingNotes: primary.trustReadiness.blockers.map((item) => item.message),
      suggestedFollowUps: primary.suggestedNextActions.slice(0, 3),
      groundedContext: claimContext
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
      sourceMode: "deterministic_discussion_contract_v1",
      focus,
      referencedClaimIds: [left.claimId, right.claimId],
      usedMemoryObjectIds: collectUsedMemoryObjectIds([left, right]),
      groundingNotes: [
        `Left support bundle: ${left.supportBundle.evidenceIds.length} evidence, ${left.supportBundle.methodIds.length} methods.`,
        `Right support bundle: ${right.supportBundle.evidenceIds.length} evidence, ${right.supportBundle.methodIds.length} methods.`
      ],
      suggestedFollowUps: ["Ask what support is missing for the weaker claim.", "Ask for a more conservative rewrite of one claim."],
      groundedContext: claimContext
    };
  }

  if ((lowered.includes("results paragraph") || lowered.includes("draft a results paragraph")) && primary) {
    return {
      mode: "results_paragraph",
      question,
      answer: `In ${primary.manuscriptTitle}, ${primary.claimText.toLowerCase()} This statement is currently supported by ${primary.supportBundle.evidenceIds.length} linked evidence item(s) and ${primary.supportBundle.methodIds.length} linked method block(s). ${primary.majorConcerns[0] ? `A key caution is that ${primary.majorConcerns[0].charAt(0).toLowerCase()}${primary.majorConcerns[0].slice(1)}` : ""}`.trim(),
      sourceMode: "deterministic_discussion_contract_v1",
      focus,
      referencedClaimIds: [primary.claimId],
      usedMemoryObjectIds: collectUsedMemoryObjectIds([primary]),
      groundingNotes: uniqueStrings([
        `Evidence links: ${primary.supportBundle.evidenceIds.join(", ") || "none"}`,
        `Method links: ${primary.supportBundle.methodIds.join(", ") || "none"}`
      ]),
      suggestedFollowUps: ["Rewrite this paragraph more conservatively.", "Ask what support is still missing."],
      groundedContext: claimContext
    };
  }

  if ((lowered.includes("rewrite") || lowered.includes("conservative")) && primary) {
    return {
      mode: "conservative_rewrite",
      question,
      answer: conservativeRewrite(primary.claimText),
      sourceMode: "deterministic_discussion_contract_v1",
      focus,
      referencedClaimIds: [primary.claimId],
      usedMemoryObjectIds: collectUsedMemoryObjectIds([primary]),
      groundingNotes: [
        `Original claim strength: ${primary.strengthLevel}`,
        `Current validity: ${primary.validityAssessment?.scoreBand ?? "unassessed"}`
      ],
      suggestedFollowUps: ["Ask why the current validity is not higher.", "Ask what support would strengthen this rewrite."],
      groundedContext: claimContext
    };
  }

  if ((lowered.includes("contradict") || lowered.includes("tension")) && input.memory.unresolvedContradictions.length > 0) {
    const contradictions =
      focus.scope === "project"
        ? input.memory.unresolvedContradictions
        : input.memory.unresolvedContradictions.filter((item) =>
            [focus.primaryClaimId, focus.comparisonClaimId].filter(Boolean).some(
              (claimId) => claimId === item.leftClaimId || claimId === item.rightClaimId
            )
          );

    return {
      mode: "contradiction_tension",
      question,
      answer:
        contradictions.length > 0
          ? contradictions
              .map((item, index) => `${index + 1}. ${item.reason}`)
              .join("\n")
          : "No contradiction signal is currently stored for the selected discussion focus.",
      sourceMode: "deterministic_discussion_contract_v1",
      focus,
      referencedClaimIds: uniqueStrings(
        contradictions.flatMap((item) => [item.leftClaimId, item.rightClaimId])
      ),
      usedMemoryObjectIds: collectUsedMemoryObjectIds(
        input.memory.claimAnalyses.filter((analysis) =>
          contradictions.some((item) => item.leftClaimId === analysis.claimId || item.rightClaimId === analysis.claimId)
        )
      ),
      groundingNotes: ["Contradiction signals are generated from remembered claim text and project-level claim comparisons."],
      suggestedFollowUps: ["Compare the two claims directly.", "Ask what support is missing for the weaker claim."],
      groundedContext:
        contradictions.length > 0
          ? buildGroundedContext(
              input.memory,
              input.memory.claimAnalyses.filter((analysis) =>
                contradictions.some(
                  (item) => item.leftClaimId === analysis.claimId || item.rightClaimId === analysis.claimId
                )
              )
            )
          : claimContext
    };
  }

  return {
    mode: "unsupported_question",
    question,
    answer:
      "This prototype only answers grounded project-memory questions right now. Try asking about strongest claims, weakest claims, missing support, contradictions, claim comparison, a results paragraph, or a conservative rewrite.",
    sourceMode: "deterministic_discussion_contract_v1",
    focus,
    referencedClaimIds: [],
    usedMemoryObjectIds: collectUsedMemoryObjectIds(input.memory.claimAnalyses.slice(0, 5)),
    groundingNotes: ["The response engine is limited to deterministic project-memory queries in this prototype."],
    suggestedFollowUps: [
      "What are the strongest claims?",
      "Why is this claim only moderate validity?",
      "What support is missing for this claim?"
    ],
    groundedContext: projectContext
  };
}
