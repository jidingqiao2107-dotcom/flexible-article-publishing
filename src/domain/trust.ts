import type {
  AIReviewResult,
  ApprovalEvent,
  Claim,
  ClaimFinalIntentStatus,
  ClaimHumanApprovalStatus,
  ClaimTrustIssue,
  ClaimTrustLifecycleState,
  ClaimTrustReadiness,
  ManuscriptTrustReadiness,
  ResearchObjectGraph
} from "./types";
import { buildClaimSupportSnapshot } from "./validity";

type ClaimTrustSnapshot = ReturnType<typeof buildClaimSupportSnapshot> & {
  sections: Array<{
    id: string;
    title: string;
    updatedAt?: string;
  }>;
};

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

  return `trust_${hash.toString(16).padStart(8, "0")}`;
}

function issue(input: ClaimTrustIssue): ClaimTrustIssue {
  return input;
}

function latestIso(values: Array<string | undefined>): string {
  const timestamps = values.filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime());
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : new Date().toISOString();
}

function sortByNewest<T extends { createdAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getClaimContextEntityIds(graph: ResearchObjectGraph, claim: Claim): string[] {
  const evidenceIds = claim.linkedEvidence.map((link) => link.evidenceId);
  const methodIds = claim.linkedMethods.map((link) => link.entityId).filter(Boolean) as string[];
  const limitationIds = claim.linkedLimitations.map((link) => link.entityId).filter(Boolean) as string[];
  const figureIds = claim.sourceFigures.map((link) => link.entityId).filter(Boolean) as string[];
  const citationIds = claim.linkedCitations.map((link) => link.entityId).filter(Boolean) as string[];
  return [...new Set([claim.id, ...evidenceIds, ...methodIds, ...limitationIds, ...figureIds, ...citationIds])];
}

function buildClaimTrustSnapshot(graph: ResearchObjectGraph, claimId: string): ClaimTrustSnapshot {
  const support = buildClaimSupportSnapshot(graph, claimId);
  const sections = graph.sections
    .filter((section) => section.objectRefs.some((ref) => ref.entityType === "claim" && ref.entityId === claimId))
    .map((section) => ({
      id: section.id,
      title: section.title,
      updatedAt: section.updatedAt
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    ...support,
    sections
  };
}

function createClaimTrustSnapshotRef(snapshot: ClaimTrustSnapshot): string {
  return simpleHash(stableStringify(snapshot));
}

function buildManuscriptTrustSnapshot(graph: ResearchObjectGraph) {
  return {
    manuscript: {
      id: graph.manuscript.id,
      title: graph.manuscript.title,
      abstract: graph.manuscript.abstract ?? "",
      updatedAt: graph.manuscript.updatedAt
    },
    sections: graph.sections
      .map((section) => ({
        id: section.id,
        title: section.title,
        updatedAt: section.updatedAt,
        objectRefs: section.objectRefs
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    claims: graph.claims
      .map((claim) => ({
        id: claim.id,
        text: claim.text,
        claimType: claim.claimType,
        strengthLevel: claim.strengthLevel,
        updatedAt: claim.updatedAt,
        status: claim.status
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  };
}

function createManuscriptTrustSnapshotRef(graph: ResearchObjectGraph): string {
  return simpleHash(stableStringify(buildManuscriptTrustSnapshot(graph)));
}

function getLatestApprovalEvent(
  approvals: ApprovalEvent[],
  predicate: (approval: ApprovalEvent) => boolean
): ApprovalEvent | undefined {
  return sortByNewest(approvals.filter(predicate))[0];
}

function getCurrentFinalIntentStatus(graph: ResearchObjectGraph): ClaimFinalIntentStatus {
  const latestFinalIntent = getLatestApprovalEvent(
    graph.approvals,
    (approval) =>
      approval.approvalType === "pre_export_intent_confirmation" &&
      approval.targetEntityType === "manuscript" &&
      approval.targetEntityId === graph.manuscript.id
  );

  if (!latestFinalIntent || !latestFinalIntent.approved) {
    return "not_confirmed";
  }

  return latestFinalIntent.targetSnapshotRef === createManuscriptTrustSnapshotRef(graph)
    ? "confirmed_current"
    : "stale_reconfirmation_required";
}

function getAiReviewStatusForClaim(graph: ResearchObjectGraph, claim: Claim): {
  aiReviewStatus: ClaimTrustReadiness["aiReviewStatus"];
  linkedBlockingReviewResults: AIReviewResult[];
  linkedWarningReviewResults: AIReviewResult[];
} {
  const relevantEntityIds = new Set(getClaimContextEntityIds(graph, claim));
  const linkedResults = graph.aiReviewResults.filter((result) =>
    result.linkedEntityIds.some((id) => relevantEntityIds.has(id))
  );
  const latestReviewAudit = sortByNewest(
    (graph.auditLogs ?? []).filter((log) => log.action === "ai_review.completed" && log.targetEntityId === graph.manuscript.id)
  )[0];
  const trustSnapshot = buildClaimTrustSnapshot(graph, claim.id);
  const latestRelevantUpdate = latestIso([
    claim.updatedAt,
    ...trustSnapshot.evidence.map((item) => item.updatedAt),
    ...trustSnapshot.methods.map((item) => item.updatedAt),
    ...trustSnapshot.limitations.map((item) => item.updatedAt),
    ...trustSnapshot.figures.map((item) => item.updatedAt),
    ...trustSnapshot.citations.map((item) => item.updatedAt),
    ...trustSnapshot.sections.map((item) => item.updatedAt)
  ]);

  if (!latestReviewAudit) {
    return {
      aiReviewStatus: "not_run",
      linkedBlockingReviewResults: [],
      linkedWarningReviewResults: []
    };
  }

  if (new Date(latestReviewAudit.createdAt).getTime() < new Date(latestRelevantUpdate).getTime()) {
    return {
      aiReviewStatus: "stale_rerun_required",
      linkedBlockingReviewResults: [],
      linkedWarningReviewResults: []
    };
  }

  const linkedBlockingReviewResults = linkedResults.filter(
    (result) => result.severity === "blocking" && ["open", "acknowledged"].includes(result.resolutionStatus)
  );
  const linkedWarningReviewResults = linkedResults.filter((result) => result.severity === "warning");

  return {
    aiReviewStatus: linkedBlockingReviewResults.length > 0 ? "completed_with_blocking_findings" : "completed_current",
    linkedBlockingReviewResults,
    linkedWarningReviewResults
  };
}

function currentHumanApprovalStatus(
  graph: ResearchObjectGraph,
  claim: Claim,
  currentSnapshotRef: string
): {
  humanApprovalStatus: ClaimHumanApprovalStatus;
  lastHumanApprovalRef?: ClaimTrustReadiness["lastHumanApprovalRef"];
  staleReasons: string[];
} {
  const latestClaimApproval = getLatestApprovalEvent(
    graph.approvals,
    (approval) =>
      approval.approvalType === "claim_approval" &&
      approval.targetEntityType === "claim" &&
      approval.targetEntityId === claim.id
  );

  if (!latestClaimApproval || !latestClaimApproval.approved) {
    return {
      humanApprovalStatus: "missing",
      staleReasons: []
    };
  }

  const lastHumanApprovalRef = {
    approvalEventId: latestClaimApproval.id,
    approvedAt: latestClaimApproval.createdAt,
    targetSnapshotRef: latestClaimApproval.targetSnapshotRef,
    actorId: latestClaimApproval.actorId
  };

  if (!latestClaimApproval.targetSnapshotRef || latestClaimApproval.targetSnapshotRef !== currentSnapshotRef) {
    return {
      humanApprovalStatus: "stale_reapproval_required",
      lastHumanApprovalRef,
      staleReasons: [
        latestClaimApproval.targetSnapshotRef
          ? "support_bundle_changed_after_human_approval"
          : "human_approval_missing_snapshot_reference"
      ]
    };
  }

  return {
    humanApprovalStatus: "approved_current",
    lastHumanApprovalRef,
    staleReasons: []
  };
}

function requiresMethodBlock(claim: Claim): boolean {
  return claim.claimType !== "background";
}

function limitationPolicy(claim: Claim): "required" | "warning" | "not_required" {
  if (claim.claimType === "mechanism" || claim.claimType === "conclusion") return "required";
  if (claim.claimType === "interpretation" || claim.claimType === "hypothesis") return "warning";
  return "not_required";
}

function deriveLifecycleState(input: {
  claim: Claim;
  blockers: ClaimTrustIssue[];
  humanApprovalStatus: ClaimHumanApprovalStatus;
  aiReviewStatus: ClaimTrustReadiness["aiReviewStatus"];
  publicationReady: boolean;
  hasReviewActivity: boolean;
}): ClaimTrustLifecycleState {
  if (input.humanApprovalStatus === "stale_reapproval_required") {
    return "stale_reapproval_required";
  }

  if (input.publicationReady) {
    return "publication_ready";
  }

  if (input.blockers.length > 0) {
    return "blocked";
  }

  if (input.humanApprovalStatus === "approved_current") {
    return "human_approved";
  }

  if (input.hasReviewActivity || input.claim.linkedEvidence.length > 0 || input.claim.linkedMethods.length > 0) {
    return "under_review";
  }

  return "draft";
}

export function getClaimTrustReadiness(graph: ResearchObjectGraph, claimId: string): ClaimTrustReadiness {
  const claim = graph.claims.find((item) => item.id === claimId);

  if (!claim) {
    throw new Error(`Claim ${claimId} was not found for trust/readiness evaluation.`);
  }

  const snapshot = buildClaimTrustSnapshot(graph, claim.id);
  const basedOnSnapshotRef = createClaimTrustSnapshotRef(snapshot);
  const basedOnLinkedObjectIds = [
    claim.id,
    ...snapshot.evidence.map((item) => item.id),
    ...snapshot.methods.map((item) => item.id),
    ...snapshot.limitations.map((item) => item.id),
    ...snapshot.figures.map((item) => item.id),
    ...snapshot.citations.map((item) => item.id),
    ...snapshot.sections.map((item) => item.id)
  ];
  const confirmedEvidenceCount = snapshot.evidence.filter((item) => item.linkStatus === "confirmed").length;
  const confirmedMethodCount = snapshot.methods.filter((item) => item.linkStatus === "confirmed").length;
  const confirmedLimitationCount = snapshot.limitations.filter((item) => item.linkStatus === "confirmed").length;
  const hasSectionPlacement = snapshot.sections.length > 0;
  const finalIntentStatus = getCurrentFinalIntentStatus(graph);
  const { humanApprovalStatus, lastHumanApprovalRef, staleReasons } = currentHumanApprovalStatus(graph, claim, basedOnSnapshotRef);
  const { aiReviewStatus, linkedBlockingReviewResults, linkedWarningReviewResults } = getAiReviewStatusForClaim(graph, claim);
  const blockers: ClaimTrustIssue[] = [];
  const warnings: ClaimTrustIssue[] = [];

  if (!hasSectionPlacement) {
    blockers.push(
      issue({
        code: "missing_section_placement",
        message: "This claim is not placed into any manuscript section yet.",
        scope: "claim",
        affects: ["draft_internal_export", "publication_export", "publication_readiness", "lifecycle"]
      })
    );
  }

  if (humanApprovalStatus === "missing") {
    blockers.push(
      issue({
        code: "missing_human_claim_approval",
        message: "Human claim approval is still missing.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "human_approval", "lifecycle"]
      })
    );
  }

  if (humanApprovalStatus === "stale_reapproval_required") {
    blockers.push(
      issue({
        code: "stale_human_approval",
        message: "The support bundle changed after the last human approval, so reapproval is required.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "human_approval", "lifecycle"]
      })
    );
  }

  if (confirmedEvidenceCount === 0) {
    blockers.push(
      issue({
        code: "missing_confirmed_evidence",
        message: "At least one confirmed evidence link is required.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "lifecycle"]
      })
    );
  }

  if (requiresMethodBlock(claim) && confirmedMethodCount === 0) {
    blockers.push(
      issue({
        code: "missing_confirmed_method",
        message: "A confirmed method link is required before this claim can be publication-ready.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "lifecycle"]
      })
    );
  }

  if (limitationPolicy(claim) === "required" && confirmedLimitationCount === 0) {
    blockers.push(
      issue({
        code: "missing_required_limitation",
        message: "This interpretive claim type requires a confirmed limitation before publication-ready use.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "lifecycle"]
      })
    );
  }

  if (aiReviewStatus === "not_run") {
    blockers.push(
      issue({
        code: "ai_review_not_run",
        message: "AI review has not been run for this claim bundle yet.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "ai_review", "lifecycle"]
      })
    );
  }

  if (aiReviewStatus === "stale_rerun_required") {
    blockers.push(
      issue({
        code: "ai_review_stale",
        message: "The support bundle changed after the last AI review, so rerun is required.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "ai_review", "lifecycle"]
      })
    );
  }

  for (const result of linkedBlockingReviewResults) {
    blockers.push(
      issue({
        code: `blocking_ai_review_${result.ruleId}`,
        message: result.message,
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "ai_review", "lifecycle"]
      })
    );
  }

  if (limitationPolicy(claim) === "warning" && confirmedLimitationCount === 0) {
    warnings.push(
      issue({
        code: "missing_interpretive_limitation_warning",
        message: "This claim would be stronger with a confirmed limitation that bounds the interpretation.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "lifecycle"]
      })
    );
  }

  if (claim.claimType === "background" && snapshot.citations.filter((item) => item.linkStatus === "confirmed").length === 0) {
    warnings.push(
      issue({
        code: "background_claim_missing_citation",
        message: "Background claims should usually include confirmed citation context.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "lifecycle"]
      })
    );
  }

  for (const reason of staleReasons) {
    warnings.push(
      issue({
        code: reason,
        message:
          reason === "support_bundle_changed_after_human_approval"
            ? "The support bundle no longer matches the last human approval snapshot."
            : "The last human approval did not record a snapshot reference, so current trust cannot be verified.",
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "human_approval", "lifecycle"]
      })
    );
  }

  for (const result of linkedWarningReviewResults) {
    warnings.push(
      issue({
        code: `warning_ai_review_${result.ruleId}`,
        message: result.message,
        scope: "claim",
        affects: ["publication_export", "publication_readiness", "ai_review", "lifecycle"]
      })
    );
  }

  const publicationReadinessBlockers = blockers.map((item) => item.message);
  const publicationReady = publicationReadinessBlockers.length === 0;
  const manuscriptPublicationBlockers: string[] = [];

  if (finalIntentStatus !== "confirmed_current") {
    manuscriptPublicationBlockers.push(
      finalIntentStatus === "not_confirmed"
        ? "Final intent confirmation is still missing."
        : "Final intent confirmation is out of date for the current manuscript state."
    );
  }

  if ((graph.datasets?.length ?? 0) > 0 && !graph.manuscript.metadata.dataAvailability) {
    manuscriptPublicationBlockers.push("Datasets exist but no data availability statement is present.");
  }

  if ((graph.softwareArtifacts?.length ?? 0) > 0 && !graph.manuscript.metadata.codeAvailability) {
    manuscriptPublicationBlockers.push("Software artifacts exist but no code availability statement is present.");
  }

  const draftInternalShare = {
    eligible: hasSectionPlacement,
    blockingReasons: hasSectionPlacement ? [] : ["This claim must be placed into a manuscript section before draft sharing."],
    warningReasons: uniqueStrings([
      ...blockers
        .filter((item) => item.code !== "missing_section_placement")
        .map((item) => item.message),
      ...warnings.map((item) => item.message)
    ])
  };

  const publicationIntent = {
    eligible: publicationReady && manuscriptPublicationBlockers.length === 0,
    blockingReasons: uniqueStrings([...publicationReadinessBlockers, ...manuscriptPublicationBlockers]),
    warningReasons: warnings.map((item) => item.message)
  };

  return {
    claimId: claim.id,
    lifecycleState: deriveLifecycleState({
      claim,
      blockers,
      humanApprovalStatus,
      aiReviewStatus,
      publicationReady,
      hasReviewActivity: aiReviewStatus !== "not_run"
    }),
    aiReviewStatus,
    humanApprovalStatus,
    blockers,
    warnings,
    stale: humanApprovalStatus === "stale_reapproval_required",
    staleReasons,
    exportEligibility: publicationIntent.eligible
      ? "publication_intent"
      : draftInternalShare.eligible
        ? "draft_internal_only"
        : "not_exportable",
    exportModeEligibility: {
      draftInternalShare,
      publicationIntent
    },
    publicationReadiness: {
      ready: publicationReady,
      reasons: publicationReadinessBlockers
    },
    finalIntentStatus,
    lastHumanApprovalRef,
    basedOnLinkedObjectIds: [...new Set(basedOnLinkedObjectIds)],
    basedOnSnapshotRef,
    updatedAt: latestIso([
      claim.updatedAt,
      ...snapshot.evidence.map((item) => item.updatedAt),
      ...snapshot.methods.map((item) => item.updatedAt),
      ...snapshot.limitations.map((item) => item.updatedAt),
      ...snapshot.figures.map((item) => item.updatedAt),
      ...snapshot.citations.map((item) => item.updatedAt),
      ...snapshot.sections.map((item) => item.updatedAt)
    ])
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function getManuscriptTrustReadiness(graph: ResearchObjectGraph): ManuscriptTrustReadiness {
  const claimTrustReadiness = graph.claims.map((claim) => getClaimTrustReadiness(graph, claim.id));
  const draftInternalShare = {
    eligible: claimTrustReadiness.every((item) => item.exportModeEligibility.draftInternalShare.eligible),
    blockingReasons: uniqueStrings(
      claimTrustReadiness.flatMap((item) =>
        item.exportModeEligibility.draftInternalShare.blockingReasons.map((reason) => `Claim ${item.claimId}: ${reason}`)
      )
    ),
    warningReasons: uniqueStrings(
      claimTrustReadiness.flatMap((item) =>
        item.exportModeEligibility.draftInternalShare.warningReasons.map((reason) => `Claim ${item.claimId}: ${reason}`)
      )
    )
  };
  const publicationIntent = {
    eligible: claimTrustReadiness.every((item) => item.exportModeEligibility.publicationIntent.eligible),
    blockingReasons: uniqueStrings(
      claimTrustReadiness.flatMap((item) =>
        item.exportModeEligibility.publicationIntent.blockingReasons.map((reason) => `Claim ${item.claimId}: ${reason}`)
      )
    ),
    warningReasons: uniqueStrings(
      claimTrustReadiness.flatMap((item) =>
        item.exportModeEligibility.publicationIntent.warningReasons.map((reason) => `Claim ${item.claimId}: ${reason}`)
      )
    )
  };

  return {
    manuscriptId: graph.manuscript.id,
    finalIntentStatus: getCurrentFinalIntentStatus(graph),
    claimTrustReadiness,
    exportModeEligibility: {
      draftInternalShare,
      publicationIntent
    }
  };
}

export function createCurrentClaimTrustSnapshotRef(graph: ResearchObjectGraph, claimId: string): string {
  return createClaimTrustSnapshotRef(buildClaimTrustSnapshot(graph, claimId));
}

export function createCurrentManuscriptTrustSnapshotRef(graph: ResearchObjectGraph): string {
  return createManuscriptTrustSnapshotRef(graph);
}
