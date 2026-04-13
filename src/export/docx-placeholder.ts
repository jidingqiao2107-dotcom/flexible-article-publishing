import { getExportReadiness, getFinalIntentApproval } from "@/domain/policies";
import { getClaimTrustReadiness, getManuscriptTrustReadiness } from "@/domain/trust";
import type { ExportMode, ExportPackage, ResearchObjectGraph, SectionObjectRef } from "@/domain/types";

function renderObjectRef(graph: ResearchObjectGraph, objectRef: SectionObjectRef): string {
  if (objectRef.entityType === "claim") {
    const claim = graph.claims.find((item) => item.id === objectRef.entityId);
    if (!claim) return `[Missing claim: ${objectRef.entityId}]`;
    const marker = getClaimTrustReadiness(graph, claim.id).publicationReadiness.ready ? "" : " [NOT PUBLICATION-READY]";
    return `Claim: ${claim.text}${marker}`;
  }

  if (objectRef.entityType === "figure") {
    const figure = graph.figures.find((item) => item.id === objectRef.entityId);
    if (!figure) return `[Missing figure: ${objectRef.entityId}]`;
    return `Figure ${figure.figureNumber ?? "TBD"}: ${figure.title}\nCaption: ${figure.caption}`;
  }

  if (objectRef.entityType === "method_block") {
    const method = graph.methods.find((item) => item.id === objectRef.entityId);
    if (!method) return `[Missing method block: ${objectRef.entityId}]`;
    return `Method: ${method.title}\n${method.content}`;
  }

  if (objectRef.entityType === "citation") {
    const citation = graph.citations.find((item) => item.id === objectRef.entityId);
    if (!citation) return `[Missing citation: ${objectRef.entityId}]`;
    return `Citation: ${citation.citationKey} - ${citation.title}`;
  }

  if (objectRef.entityType === "limitation") {
    const limitation = graph.limitations.find((item) => item.id === objectRef.entityId);
    if (!limitation) return `[Missing limitation: ${objectRef.entityId}]`;
    return `Limitation: ${limitation.text}`;
  }

  return `[Unsupported object ref: ${objectRef.entityType}]`;
}

export function renderManuscriptText(graph: ResearchObjectGraph): string {
  const sortedSections = [...graph.sections].sort((a, b) => a.orderIndex - b.orderIndex);
  const body = sortedSections
    .map((section) => {
      const refs = [...section.objectRefs].sort((a, b) => a.orderIndex - b.orderIndex);
      const sectionBody = refs.map((ref) => renderObjectRef(graph, ref)).join("\n\n");
      return `## ${section.title}\n\n${sectionBody}`;
    })
    .join("\n\n");

  return `# ${graph.manuscript.title}\n\n${graph.manuscript.abstract ?? ""}\n\n${body}`;
}

export function createDocxPlaceholderExport(input: {
  id: string;
  graph: ResearchObjectGraph;
  createdBy: string;
  versionId?: string;
  now?: string;
  mode?: ExportMode;
}): {
  exportMode: ExportMode;
  exportOutcome: {
    status: "allowed" | "warning_bearing_but_allowed" | "blocked" | "stale_reapproval_required";
    blockingReasons: string[];
    warningReasons: string[];
  };
  exportPackage: ExportPackage;
  renderedText?: string;
} {
  const exportMode = input.mode ?? "publication_intent";
  const manuscriptTrust = getManuscriptTrustReadiness(input.graph);
  const modeEligibility =
    exportMode === "draft_internal"
      ? manuscriptTrust.exportModeEligibility.draftInternalShare
      : manuscriptTrust.exportModeEligibility.publicationIntent;
  const readinessReport =
    exportMode === "publication_intent"
      ? getExportReadiness(input.graph)
      : {
          canExport: modeEligibility.eligible,
          blockingReasons: modeEligibility.blockingReasons,
          warnings: modeEligibility.warningReasons
        };
  const finalIntentApproval = getFinalIntentApproval(input.graph);
  const renderedText = readinessReport.canExport ? renderManuscriptText(input.graph) : undefined;
  const hasStaleTrust =
    manuscriptTrust.finalIntentStatus === "stale_reconfirmation_required" ||
    manuscriptTrust.claimTrustReadiness.some(
      (claimTrust) =>
        claimTrust.stale ||
        claimTrust.lifecycleState === "stale_reapproval_required" ||
        claimTrust.aiReviewStatus === "stale_rerun_required"
    );
  const exportOutcome = {
    status: readinessReport.canExport
      ? readinessReport.warnings.length > 0
        ? "warning_bearing_but_allowed"
        : "allowed"
      : hasStaleTrust
        ? "stale_reapproval_required"
        : "blocked",
    blockingReasons: readinessReport.blockingReasons,
    warningReasons: readinessReport.warnings
  } as const;

  return {
    exportMode,
    exportOutcome,
    exportPackage: {
      id: input.id,
      type: "export_package",
      manuscriptId: input.graph.manuscript.id,
      exportType: "docx_placeholder",
      status: readinessReport.canExport ? "generated" : "blocked",
      versionId: input.versionId,
      finalApprovalEventId: finalIntentApproval?.id,
      snapshotPointer: input.versionId ? `version://${input.versionId}` : undefined,
      artifactPointer: renderedText ? `memory://exports/${input.id}.docx-placeholder.txt` : undefined,
      readinessReport,
      createdBy: input.createdBy,
      createdAt: input.now ?? new Date().toISOString()
    },
    renderedText
  };
}
