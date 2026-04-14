import type {
  Claim,
  ClaimValidityAssessment,
  ClaimValidityFreshnessStatus,
  Evidence,
  Figure,
  MethodBlock,
  ResearchObjectGraph,
  SupportAsset,
  ValidityScoreBand
} from "./types";

type ClaimSupportSnapshot = {
  claim: {
    id: string;
    text: string;
    claimType: Claim["claimType"];
    strengthLevel: Claim["strengthLevel"];
  };
  evidence: Array<{
    id: string;
    summary: string;
    evidenceType: Evidence["evidenceType"];
    updatedAt?: string;
    linkStatus: string;
  }>;
  methods: Array<{
    id: string;
    title: string;
    content: string;
    updatedAt?: string;
    linkStatus: string;
  }>;
  limitations: Array<{
    id: string;
    text: string;
    updatedAt?: string;
    linkStatus: string;
  }>;
  figures: Array<{
    id: string;
    title: string;
    caption: string;
    updatedAt?: string;
    linkStatus: string;
  }>;
  citations: Array<{
    id: string;
    title: string;
    updatedAt?: string;
    linkStatus: string;
  }>;
  supportAssets: Array<{
    id: string;
    supportCategory: SupportAsset["supportCategory"];
    fileType: string;
    originalFilename: string;
    updatedAt?: string;
    linkStatus: string;
  }>;
};

function asSnapshot(value: Record<string, unknown>): Partial<ClaimSupportSnapshot> {
  return value as Partial<ClaimSupportSnapshot>;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function bandFromScore(score: number): ValidityScoreBand {
  if (score >= 80) return "high";
  if (score >= 65) return "strong";
  if (score >= 45) return "moderate";
  if (score >= 25) return "weak";
  return "insufficient";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

function simpleHash(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return `snapshot_${hash.toString(16).padStart(8, "0")}`;
}

function includesCausalLanguage(text: string): boolean {
  return /\b(causes?|caused|causal|drives?|leads to|results in|due to)\b/i.test(text);
}

function dimension(score: number, rationale: string, drivers: string[]) {
  return {
    score: clamp(score),
    rationale,
    drivers
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildClaimSupportSnapshot(graph: ResearchObjectGraph, claimId: string): ClaimSupportSnapshot {
  const claim = graph.claims.find((item) => item.id === claimId);

  if (!claim) {
    throw new Error(`Claim ${claimId} was not found for validity assessment.`);
  }

  const evidence = graph.evidence
    .filter((item) => claim.linkedEvidence.some((link) => link.evidenceId === item.id))
    .map((item) => ({
      id: item.id,
      summary: item.summary,
      evidenceType: item.evidenceType,
      updatedAt: item.updatedAt,
      linkStatus: claim.linkedEvidence.find((link) => link.evidenceId === item.id)?.status ?? "proposed"
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const methods = graph.methods
    .filter((item) => claim.linkedMethods.some((link) => link.entityId === item.id) || item.linkedClaimIds.includes(claim.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      updatedAt: item.updatedAt,
      linkStatus:
        claim.linkedMethods.find((link) => link.entityId === item.id)?.status ??
        (item.linkedClaimIds.includes(claim.id) ? "proposed" : "unlinked")
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const limitations = graph.limitations
    .filter((item) => claim.linkedLimitations.some((link) => link.entityId === item.id) || item.linkedClaimIds.includes(claim.id))
    .map((item) => ({
      id: item.id,
      text: item.text,
      updatedAt: item.updatedAt,
      linkStatus:
        claim.linkedLimitations.find((link) => link.entityId === item.id)?.status ??
        (item.linkedClaimIds.includes(claim.id) ? "proposed" : "unlinked")
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const figures = graph.figures
    .filter((item) => claim.sourceFigures.some((link) => link.entityId === item.id) || item.linkedClaimIds.includes(claim.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      caption: item.caption,
      updatedAt: item.updatedAt,
      linkStatus:
        claim.sourceFigures.find((link) => link.entityId === item.id)?.status ??
        (item.linkedClaimIds.includes(claim.id) ? "proposed" : "unlinked")
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const citations = graph.citations
    .filter((item) => claim.linkedCitations.some((link) => link.entityId === item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt,
      linkStatus: claim.linkedCitations.find((link) => link.entityId === item.id)?.status ?? "proposed"
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const relevantAssetIds = new Set<string>([
    ...evidence.flatMap((item) =>
      graph.evidence.find((evidenceItem) => evidenceItem.id === item.id)?.linkedAssetIds ?? []
    ),
    ...figures.flatMap((item) =>
      graph.figures.find((figureItem) => figureItem.id === item.id)?.uploadedAssetIds ?? []
    )
  ]);

  const supportAssets = (graph.supportAssets ?? [])
    .filter((item) => relevantAssetIds.has(item.id))
    .map((item) => ({
      id: item.id,
      supportCategory: item.supportCategory,
      fileType: item.fileType,
      originalFilename: item.originalFilename,
      updatedAt: item.updatedAt,
      linkStatus:
        item.claimLinks.find((link) => link.claimId === claim.id)?.status ??
        (item.linkedClaimIds.includes(claim.id) ? "proposed" : "unlinked")
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    claim: {
      id: claim.id,
      text: claim.text,
      claimType: claim.claimType,
      strengthLevel: claim.strengthLevel
    },
    evidence,
    methods,
    limitations,
    figures,
    citations,
    supportAssets
  };
}

export function createClaimValiditySnapshotRef(snapshot: ClaimSupportSnapshot): string {
  return simpleHash(stableStringify(snapshot));
}

export function getClaimValidityStaleness(input: {
  previousSnapshot: Record<string, unknown>;
  currentSnapshot: ClaimSupportSnapshot;
}): {
  stale: boolean;
  freshnessStatus: ClaimValidityFreshnessStatus;
  staleReasons: string[];
} {
  const previous = asSnapshot(input.previousSnapshot);
  const current = input.currentSnapshot;
  const reasons: string[] = [];
  let freshnessStatus: ClaimValidityFreshnessStatus = "current";

  if (stableStringify(previous.claim) !== stableStringify(current.claim)) {
    reasons.push("claim_text_or_claim_strength_changed");
    freshnessStatus = "stale";
  }

  if (stableStringify(previous.evidence ?? []) !== stableStringify(current.evidence)) {
    reasons.push("evidence_bundle_changed");
    freshnessStatus = "stale";
  }

  if (stableStringify(previous.methods ?? []) !== stableStringify(current.methods)) {
    reasons.push("method_context_changed");
    freshnessStatus = "stale";
  }

  if (stableStringify(previous.limitations ?? []) !== stableStringify(current.limitations)) {
    reasons.push("limitation_context_changed");
    if (freshnessStatus !== "stale") {
      freshnessStatus = "partially_stale";
    }
  }

  if (stableStringify(previous.figures ?? []) !== stableStringify(current.figures)) {
    reasons.push("figure_context_changed");
    if (freshnessStatus !== "stale") {
      freshnessStatus = "partially_stale";
    }
  }

  if (stableStringify(previous.citations ?? []) !== stableStringify(current.citations)) {
    reasons.push("citation_context_changed");
    if (freshnessStatus !== "stale") {
      freshnessStatus = "partially_stale";
    }
  }

  if (stableStringify(previous.supportAssets ?? []) !== stableStringify(current.supportAssets)) {
    reasons.push("support_asset_bundle_changed");
    if (freshnessStatus !== "stale") {
      freshnessStatus = "partially_stale";
    }
  }

  return {
    stale: reasons.length > 0,
    freshnessStatus,
    staleReasons: reasons
  };
}

export function hydrateClaimValidityAssessment(input: {
  assessment: ClaimValidityAssessment;
  graph: ResearchObjectGraph;
}): ClaimValidityAssessment {
  const currentSnapshot = buildClaimSupportSnapshot(input.graph, input.assessment.claimId);
  const freshness =
    input.assessment.basedOnSnapshotRef === createClaimValiditySnapshotRef(currentSnapshot)
      ? {
          stale: false,
          freshnessStatus: "current" as ClaimValidityFreshnessStatus,
          staleReasons: [] as string[]
        }
      : getClaimValidityStaleness({
          previousSnapshot: input.assessment.basedOnSnapshot,
          currentSnapshot
        });

  return {
    ...input.assessment,
    stale: freshness.stale,
    freshnessStatus: freshness.freshnessStatus,
    staleReasons: freshness.staleReasons
  };
}

export function selectLatestClaimValidityAssessments(input: {
  assessments: ClaimValidityAssessment[];
  graph: ResearchObjectGraph;
  claimId?: string;
}): ClaimValidityAssessment[] {
  const latestByClaim = new Map<string, ClaimValidityAssessment>();

  const orderedAssessments = [...input.assessments].sort(
    (left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime()
  );

  for (const assessment of orderedAssessments) {
    if (input.claimId && assessment.claimId !== input.claimId) {
      continue;
    }

    if (!latestByClaim.has(assessment.claimId)) {
      latestByClaim.set(assessment.claimId, hydrateClaimValidityAssessment({ assessment, graph: input.graph }));
    }
  }

  const claimOrder = new Map(input.graph.claims.map((claim, index) => [claim.id, index]));

  return [...latestByClaim.values()].sort(
    (left, right) => (claimOrder.get(left.claimId) ?? Number.MAX_SAFE_INTEGER) - (claimOrder.get(right.claimId) ?? Number.MAX_SAFE_INTEGER)
  );
}

export function assessClaimValidity(input: {
  graph: ResearchObjectGraph;
  claimId: string;
  assessmentId: string;
  now?: string;
  existingAssessment?: Pick<ClaimValidityAssessment, "basedOnSnapshot" | "basedOnSnapshotRef">;
}): ClaimValidityAssessment {
  const claim = input.graph.claims.find((item) => item.id === input.claimId);

  if (!claim) {
    throw new Error(`Claim ${input.claimId} was not found for validity assessment.`);
  }

  const snapshot = buildClaimSupportSnapshot(input.graph, claim.id);
  const basedOnLinkedObjectIds = uniqueStrings([
    claim.id,
    ...snapshot.evidence.map((item) => item.id),
    ...snapshot.methods.map((item) => item.id),
    ...snapshot.limitations.map((item) => item.id),
    ...snapshot.figures.map((item) => item.id),
    ...snapshot.citations.map((item) => item.id),
    ...snapshot.supportAssets.map((item) => item.id)
  ]);
  const basedOnSnapshotRef = createClaimValiditySnapshotRef(snapshot);

  const confirmedEvidence = snapshot.evidence.filter((item) => item.linkStatus === "confirmed");
  const confirmedMethods = snapshot.methods.filter((item) => item.linkStatus === "confirmed");
  const confirmedLimitations = snapshot.limitations.filter((item) => item.linkStatus === "confirmed");
  const confirmedFigures = snapshot.figures.filter((item) => item.linkStatus === "confirmed");
  const confirmedCitations = snapshot.citations.filter((item) => item.linkStatus === "confirmed");
  const causalLanguage = includesCausalLanguage(claim.text);

  const supportStrengthScore =
    20 +
    confirmedEvidence.length * 28 +
    confirmedFigures.length * 8 +
    (claim.strengthLevel === "weak" || claim.strengthLevel === "exploratory" ? -10 : 0);
  const supportStrength = dimension(
    supportStrengthScore,
    confirmedEvidence.length > 0
      ? "The claim has directly linked evidence support."
      : "The claim lacks confirmed direct evidence support.",
    uniqueStrings([
      confirmedEvidence.length > 0 ? `${confirmedEvidence.length} confirmed evidence item(s)` : "no confirmed evidence",
      confirmedFigures.length > 0 ? `${confirmedFigures.length} linked figure context` : ""
    ])
  );

  const statementFitPenalty =
    (causalLanguage && claim.claimType !== "mechanism" ? 35 : 0) +
    (["conclusion", "mechanism"].includes(claim.claimType) && ["weak", "exploratory"].includes(claim.strengthLevel) ? 20 : 0);
  const statementFit = dimension(
    85 - statementFitPenalty,
    statementFitPenalty > 0
      ? "The wording or claim type risks overstating what the support bundle shows."
      : "The wording is reasonably aligned with the support bundle.",
    uniqueStrings([
      causalLanguage && claim.claimType !== "mechanism" ? "causal wording without mechanism framing" : "",
      ["conclusion", "mechanism"].includes(claim.claimType) && ["weak", "exploratory"].includes(claim.strengthLevel)
        ? "interpretive claim with low strength setting"
        : ""
    ])
  );

  const evidenceCoverage = dimension(
    25 + confirmedEvidence.length * 35 + (snapshot.evidence.length > confirmedEvidence.length ? -10 : 0),
    confirmedEvidence.length > 0
      ? "The claim has at least one confirmed evidence path."
      : "No confirmed evidence path currently covers this claim.",
    uniqueStrings([
      confirmedEvidence.length > 0 ? `${confirmedEvidence.length} confirmed evidence link(s)` : "coverage gap",
      snapshot.evidence.length > confirmedEvidence.length ? "some linked evidence remains unconfirmed" : ""
    ])
  );

  const methodAdequacy = dimension(
    confirmedMethods.length > 0
      ? 55 +
          Math.min(
            35,
            Math.round(
              confirmedMethods.reduce((total, item) => total + Math.min(1, item.content.trim().length / 220), 0) * 20
            )
          )
      : 20,
    confirmedMethods.length > 0
      ? "Method context exists for interpreting how the evidence was produced."
      : "Method context is missing or unconfirmed for this claim.",
    uniqueStrings([
      confirmedMethods.length > 0 ? `${confirmedMethods.length} confirmed method link(s)` : "no confirmed method link",
      confirmedMethods.some((item) => item.content.trim().length < 120) ? "method description still looks brief" : ""
    ])
  );

  const limitationImpact = dimension(
    ["conclusion", "mechanism", "interpretation"].includes(claim.claimType)
      ? confirmedLimitations.length > 0
        ? 78
        : 42
      : confirmedLimitations.length > 0
        ? 82
        : 68,
    confirmedLimitations.length > 0
      ? "Limitation context is present and helps bound the claim."
      : "Limitation context is currently thin for this claim bundle.",
    uniqueStrings([
      confirmedLimitations.length > 0 ? `${confirmedLimitations.length} confirmed limitation link(s)` : "no confirmed limitation link"
    ])
  );

  const alternativeExplanationPressure = dimension(
    80 -
      (confirmedEvidence.length === 0 ? 30 : 0) -
      (confirmedMethods.length === 0 ? 15 : 0) -
      (confirmedLimitations.length === 0 && ["conclusion", "mechanism", "interpretation"].includes(claim.claimType) ? 20 : 0) +
      Math.min(10, confirmedCitations.length * 4),
    "Alternative explanations are better contained when evidence, method, and interpretive boundaries all exist together.",
    uniqueStrings([
      confirmedEvidence.length === 0 ? "support leaves room for alternative explanations" : "",
      confirmedMethods.length === 0 ? "method gap increases ambiguity" : "",
      confirmedLimitations.length === 0 && ["conclusion", "mechanism", "interpretation"].includes(claim.claimType)
        ? "interpretive claim lacks bounded limitations"
        : "",
      confirmedCitations.length > 0 ? `${confirmedCitations.length} citation context item(s)` : ""
    ])
  );

  const integratedScore = clamp(
    supportStrength.score * 0.24 +
      statementFit.score * 0.18 +
      evidenceCoverage.score * 0.2 +
      methodAdequacy.score * 0.16 +
      limitationImpact.score * 0.1 +
      alternativeExplanationPressure.score * 0.12
  );
  const integratedAssessment = dimension(
    integratedScore,
    "Integrated assessment combines direct support, statement fit, method support, limitation framing, and alternative-explanation pressure.",
    uniqueStrings([
      supportStrength.score < 50 ? "direct support is the main weakness" : "",
      statementFit.score < 60 ? "claim wording or framing may be too strong" : "",
      methodAdequacy.score < 55 ? "method context is dragging confidence down" : "",
      limitationImpact.score < 55 ? "limitations are under-specified for the claim type" : ""
    ])
  );

  const overallValidityScore = integratedAssessment.score;
  const scoreBand = bandFromScore(overallValidityScore);
  const majorConcerns = uniqueStrings([
    supportStrength.score < 50 ? "Direct evidence support is still weak or unconfirmed." : "",
    statementFit.score < 60 ? "The claim framing risks overstating what the support bundle justifies." : "",
    methodAdequacy.score < 55 ? "Method adequacy is not yet strong enough for confident interpretation." : "",
    limitationImpact.score < 55 ? "Limitations are not yet doing enough to bound this interpretation." : ""
  ]).slice(0, 3);
  const suggestedNextActions = uniqueStrings([
    confirmedEvidence.length === 0 ? "Confirm at least one linked evidence item for this claim." : "",
    confirmedMethods.length === 0 ? "Attach or confirm the method block that produced the supporting evidence." : "",
    statementFit.score < 60 ? "Tone down the wording or adjust the claim type to fit the available support." : "",
    confirmedLimitations.length === 0 && ["interpretation", "mechanism", "conclusion"].includes(claim.claimType)
      ? "Add a limitation that explains where the interpretation may not generalize."
      : "",
    confirmedCitations.length === 0 && claim.claimType === "background" ? "Link citation context if this is intended as a background claim." : ""
  ]).slice(0, 4);
  const biggestScoreDrivers = uniqueStrings([
    ...supportStrength.drivers,
    ...statementFit.drivers,
    ...evidenceCoverage.drivers,
    ...methodAdequacy.drivers,
    ...limitationImpact.drivers
  ]).slice(0, 5);

  const modelConfidence = clamp(
    45 +
      (snapshot.evidence.length > 0 ? 15 : 0) +
      (snapshot.methods.length > 0 ? 10 : 0) +
      (snapshot.limitations.length > 0 ? 8 : 0) +
      (snapshot.figures.length > 0 ? 6 : 0) +
      (snapshot.citations.length > 0 ? 6 : 0),
    0,
    100
  ) / 100;

  const freshness = input.existingAssessment
    ? getClaimValidityStaleness({
        previousSnapshot: input.existingAssessment.basedOnSnapshot,
        currentSnapshot: snapshot
      })
    : { stale: false, freshnessStatus: "current" as ClaimValidityFreshnessStatus, staleReasons: [] as string[] };

  return {
    assessmentId: input.assessmentId,
    type: "claim_validity_assessment",
    manuscriptId: input.graph.manuscript.id,
    claimId: claim.id,
    overallValidityScore,
    scoreBand,
    summaryForUser:
      scoreBand === "high" || scoreBand === "strong"
        ? "This claim currently looks well supported within its linked evidence and method context."
        : scoreBand === "moderate"
          ? "This claim has meaningful support, but the bundle still has important weaknesses."
          : "This claim currently looks weakly supported or over-expressed for its support bundle.",
    majorConcerns,
    suggestedNextActions,
    biggestScoreDrivers,
    expandableDimensions: {
      supportStrength,
      statementFit,
      evidenceCoverage,
      methodAdequacy,
      limitationImpact,
      alternativeExplanationPressure,
      integratedAssessment
    },
    modelConfidence,
    generatedAt: input.now ?? new Date().toISOString(),
    sourceMode: "deterministic_validity_contract_v1",
    basedOnLinkedObjectIds,
    basedOnSnapshotRef,
    basedOnSnapshot: snapshot as unknown as Record<string, unknown>,
    stale: freshness.stale,
    freshnessStatus: freshness.freshnessStatus,
    staleReasons: freshness.staleReasons
  };
}
