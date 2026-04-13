import type { AIReviewResult, Claim, Figure, MethodBlock, ResearchObjectGraph, ReviewSeverity } from "@/domain/types";

type RuleIssue = Omit<AIReviewResult, "id" | "type" | "manuscriptId" | "modelActionType" | "createdAt"> & {
  ruleId: string;
};

function buildResult(manuscriptId: string, issue: RuleIssue, index: number): AIReviewResult {
  return {
    id: `review_${issue.ruleId.replaceAll(".", "_")}_${index}`,
    type: "ai_review_result",
    manuscriptId,
    ruleId: issue.ruleId,
    severity: issue.severity,
    message: issue.message,
    linkedEntityIds: issue.linkedEntityIds,
    recommendedAction: issue.recommendedAction,
    resolutionStatus: issue.resolutionStatus,
    modelActionType: "deterministic_rule_check",
    createdAt: new Date().toISOString()
  };
}

function issue(input: {
  ruleId: string;
  severity: ReviewSeverity;
  message: string;
  linkedEntityIds: string[];
  recommendedAction: string;
}): RuleIssue {
  return {
    ...input,
    resolutionStatus: "open"
  };
}

function hasConfirmedEvidence(claim: Claim): boolean {
  return claim.linkedEvidence.some((link) => link.status === "confirmed");
}

function hasConfirmedMethod(claim: Claim): boolean {
  return claim.linkedMethods.some((link) => link.status === "confirmed");
}

function hasConfirmedLimitation(claim: Claim): boolean {
  return claim.linkedLimitations.some((link) => link.status === "confirmed");
}

function includesCausalLanguage(text: string): boolean {
  return /\b(causes?|caused|causal|drives?|leads to|results in|due to)\b/i.test(text);
}

function methodIsInsufficient(method: MethodBlock): boolean {
  return method.content.trim().length < 120;
}

function figureIsOrphan(figure: Figure): boolean {
  return figure.linkedClaimIds.length === 0 && figure.linkedEvidenceIds.length === 0;
}

export function runDeterministicAiReview(graph: ResearchObjectGraph): AIReviewResult[] {
  const issues: RuleIssue[] = [];

  for (const claim of graph.claims) {
    if (!hasConfirmedEvidence(claim)) {
      issues.push(
        issue({
          ruleId: "claim.unsupported",
          severity: "blocking",
          message: "Claim has no confirmed linked evidence.",
          linkedEntityIds: [claim.id],
          recommendedAction: "Link and confirm evidence or revise/remove the claim."
        })
      );
    }

    if (hasConfirmedEvidence(claim) && !hasConfirmedMethod(claim)) {
      issues.push(
        issue({
          ruleId: "claim.evidence_missing_method",
          severity: "warning",
          message: "Claim has evidence but no confirmed method link.",
          linkedEntityIds: [claim.id],
          recommendedAction: "Attach the method block that describes how the evidence was produced."
        })
      );
    }

    if (includesCausalLanguage(claim.text) && claim.claimType !== "mechanism") {
      issues.push(
        issue({
          ruleId: "claim.causal_language_without_mechanism",
          severity: claim.strengthLevel === "weak" || claim.strengthLevel === "exploratory" ? "blocking" : "warning",
          message: "Claim uses causal language but is not typed as a mechanism claim.",
          linkedEntityIds: [claim.id],
          recommendedAction: "Downgrade causal wording, change claim type, or add stronger mechanistic evidence."
        })
      );
    }

    if (["conclusion", "mechanism"].includes(claim.claimType) && !hasConfirmedLimitation(claim)) {
      issues.push(
        issue({
          ruleId: "claim.missing_limitation",
          severity: "warning",
          message: "High-interpretation claim has no confirmed linked limitation.",
          linkedEntityIds: [claim.id],
          recommendedAction: "Attach an applicable limitation or document why no limitation is needed."
        })
      );
    }
  }

  for (const figure of graph.figures) {
    if (figureIsOrphan(figure)) {
      issues.push(
        issue({
          ruleId: "figure.orphan",
          severity: "warning",
          message: "Figure is not linked to any claim or evidence object.",
          linkedEntityIds: [figure.id],
          recommendedAction: "Link the figure to evidence and the claims it supports, or remove it from the manuscript."
        })
      );
    }

    if (figure.caption.trim().length === 0) {
      issues.push(
        issue({
          ruleId: "figure.caption_missing",
          severity: "blocking",
          message: "Figure is missing a caption.",
          linkedEntityIds: [figure.id],
          recommendedAction: "Add a caption that can be checked against linked claims and evidence."
        })
      );
    }
  }

  for (const method of graph.methods) {
    if (methodIsInsufficient(method)) {
      issues.push(
        issue({
          ruleId: "method.insufficient_description",
          severity: "warning",
          message: "Method block appears too short for reproducibility review.",
          linkedEntityIds: [method.id],
          recommendedAction: "Expand the method block with protocol, controls, sample handling, and analysis details."
        })
      );
    }
  }

  if ((graph.datasets?.length ?? 0) > 0 && !graph.manuscript.metadata.dataAvailability) {
    issues.push(
      issue({
        ruleId: "metadata.data_availability_missing",
        severity: "blocking",
        message: "Dataset records exist but no data availability statement is present.",
        linkedEntityIds: [graph.manuscript.id],
        recommendedAction: "Add a data availability statement before export."
      })
    );
  }

  if ((graph.softwareArtifacts?.length ?? 0) > 0 && !graph.manuscript.metadata.codeAvailability) {
    issues.push(
      issue({
        ruleId: "metadata.code_availability_missing",
        severity: "blocking",
        message: "Software artifact records exist but no code availability statement is present.",
        linkedEntityIds: [graph.manuscript.id],
        recommendedAction: "Add a code availability statement before export."
      })
    );
  }

  for (const provenance of graph.provenance) {
    if (provenance.modelActionType && provenance.authorApprovalStatus === "pending") {
      issues.push(
        issue({
          ruleId: "version.unreviewed_ai_edit",
          severity: "blocking",
          message: "AI-generated or AI-modified content has not been reviewed by an author.",
          linkedEntityIds: [provenance.targetEntityId],
          recommendedAction: "Review, approve, reject, or override the AI-originated edit."
        })
      );
    }
  }

  return issues.map((item, index) => buildResult(graph.manuscript.id, item, index + 1));
}

