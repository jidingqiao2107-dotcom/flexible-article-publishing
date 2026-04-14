import type { ClaimCheckResult, ClaimValidityAssessment, ResearchObjectGraph, SupportAsset } from "./types";

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function linkStatusForAsset(asset: SupportAsset, claimId: string) {
  return asset.claimLinks.find((link) => link.claimId === claimId)?.status;
}

export function buildClaimCheckResult(input: {
  graph: ResearchObjectGraph;
  claimId: string;
  assessment: ClaimValidityAssessment;
}): ClaimCheckResult {
  const claim = input.graph.claims.find((item) => item.id === input.claimId);

  if (!claim) {
    throw new Error(`Claim ${input.claimId} was not found for claim checking.`);
  }

  const trust = input.graph.claimTrustReadiness?.find((item) => item.claimId === input.claimId);
  const supportAssets = (input.graph.supportAssets ?? []).filter((asset) =>
    asset.linkedClaimIds.includes(input.claimId) ||
    claim.linkedEvidence.some((link) => {
      const evidence = input.graph.evidence.find((item) => item.id === link.evidenceId);
      return evidence?.linkedAssetIds.includes(asset.id);
    }) ||
    claim.sourceFigures.some((link) => {
      const figure = input.graph.figures.find((item) => item.id === link.entityId);
      return figure?.uploadedAssetIds.includes(asset.id);
    })
  );
  const evidenceUsed = input.graph.evidence.filter((item) => claim.linkedEvidence.some((link) => link.evidenceId === item.id));
  const figuresUsed = input.graph.figures.filter((item) => claim.sourceFigures.some((link) => link.entityId === item.id));
  const methodsUsed = input.graph.methods.filter((item) => claim.linkedMethods.some((link) => link.entityId === item.id));
  const limitationsUsed = input.graph.limitations.filter((item) => claim.linkedLimitations.some((link) => link.entityId === item.id));
  const citationsUsed = input.graph.citations.filter((item) => claim.linkedCitations.some((link) => link.entityId === item.id));
  const statementFitScore = input.assessment.expandableDimensions.statementFit.score;
  const methodAdequacyScore = input.assessment.expandableDimensions.methodAdequacy.score;
  const limitationScore = input.assessment.expandableDimensions.limitationImpact.score;

  return {
    claimId: claim.id,
    manuscriptId: input.graph.manuscript.id,
    validityAssessment: input.assessment,
    summaryForUser: input.assessment.summaryForUser,
    supportStrength: input.assessment.expandableDimensions.supportStrength,
    overclaimRisk: {
      level: statementFitScore >= 75 ? "low" : statementFitScore >= 55 ? "moderate" : "high",
      rationale: input.assessment.expandableDimensions.statementFit.rationale
    },
    missingSupport: uniqueStrings([
      ...(trust?.blockers.map((item) => item.message) ?? []),
      ...input.assessment.suggestedNextActions.filter((item) => /confirm|attach|add/i.test(item))
    ]),
    methodologicalConcern:
      methodAdequacyScore >= 60 ? undefined : input.assessment.expandableDimensions.methodAdequacy.rationale,
    limitationImpact:
      limitationScore >= 70 ? undefined : input.assessment.expandableDimensions.limitationImpact.rationale,
    recommendedNextActions: input.assessment.suggestedNextActions,
    majorConcerns: input.assessment.majorConcerns,
    evidenceReferencesUsed: [
      ...supportAssets.map((asset) => ({
        objectId: asset.id,
        objectType: "support_asset" as const,
        label: asset.originalFilename,
        supportCategory: asset.supportCategory,
        fileType: asset.fileType,
        originalFilename: asset.originalFilename,
        linkStatus: linkStatusForAsset(asset, claim.id)
      })),
      ...evidenceUsed.map((item) => ({
        objectId: item.id,
        objectType: "evidence" as const,
        label: item.summary
      })),
      ...figuresUsed.map((item) => ({
        objectId: item.id,
        objectType: "figure" as const,
        label: item.title
      })),
      ...methodsUsed.map((item) => ({
        objectId: item.id,
        objectType: "method_block" as const,
        label: item.title
      })),
      ...limitationsUsed.map((item) => ({
        objectId: item.id,
        objectType: "limitation" as const,
        label: item.text
      })),
      ...citationsUsed.map((item) => ({
        objectId: item.id,
        objectType: "citation" as const,
        label: item.title
      }))
    ],
    stale: input.assessment.stale,
    freshnessStatus: input.assessment.freshnessStatus,
    staleReasons: input.assessment.staleReasons
  };
}
