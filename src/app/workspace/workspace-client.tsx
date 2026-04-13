"use client";

import { useEffect, useMemo, useState } from "react";

type ManuscriptSummary = { id: string; projectId: string; title: string; articleType?: string };
type Author = { id: string; displayName: string };
type MembershipContext = {
  actor: Author;
  projectRole: string | null;
  manuscriptRole: string | null;
  manuscriptTitle?: string;
  allowedActions?: {
    canApproveClaim: boolean;
    canApproveClaimEvidence: boolean;
    canConfirmFinalIntent: boolean;
  };
};
type ClaimLink = { entityId?: string; evidenceId?: string; status: string };
type Claim = {
  id: string;
  text: string;
  claimType: string;
  strengthLevel: string;
  status: string;
  authorApproved: boolean;
  publicationReady: boolean;
  linkedEvidence: Array<{ evidenceId: string; status: string }>;
  linkedMethods: ClaimLink[];
  linkedLimitations: ClaimLink[];
  sourceFigures: ClaimLink[];
};
type Evidence = { id: string; summary: string; evidenceType: string; linkedClaimIds: string[]; confidenceNotes?: string };
type Figure = { id: string; title: string; caption: string; figureNumber?: string; linkedClaimIds: string[] };
type MethodBlock = { id: string; title: string; content: string; linkedClaimIds: string[] };
type Limitation = { id: string; text: string; linkedClaimIds: string[] };
type Section = { id: string; title: string; orderIndex?: number; objectRefs: Array<{ entityType: string; entityId: string }> };
type AIReviewResult = {
  id: string;
  ruleId: string;
  severity: "info" | "warning" | "blocking";
  message: string;
  linkedEntityIds: string[];
  recommendedAction: string;
};
type ClaimValidityAssessment = {
  assessmentId: string;
  claimId: string;
  overallValidityScore: number;
  scoreBand: "insufficient" | "weak" | "moderate" | "strong" | "high";
  summaryForUser: string;
  majorConcerns: string[];
  suggestedNextActions: string[];
  biggestScoreDrivers: string[];
  expandableDimensions: Record<string, { score: number; rationale: string; drivers: string[] }>;
  modelConfidence: number;
  generatedAt: string;
  sourceMode: string;
  basedOnSnapshotRef: string;
  stale: boolean;
  freshnessStatus: "current" | "partially_stale" | "stale";
  staleReasons: string[];
};
type ClaimTrustReadiness = {
  claimId: string;
  lifecycleState: "draft" | "under_review" | "blocked" | "human_approved" | "publication_ready" | "stale_reapproval_required";
  aiReviewStatus: "not_run" | "completed_current" | "completed_with_blocking_findings" | "stale_rerun_required";
  humanApprovalStatus: "missing" | "approved_current" | "stale_reapproval_required";
  blockers: Array<{ code: string; message: string; scope: "claim" | "manuscript" }>;
  warnings: Array<{ code: string; message: string; scope: "claim" | "manuscript" }>;
  stale: boolean;
  staleReasons: string[];
  exportEligibility: "not_exportable" | "draft_internal_only" | "publication_intent";
  exportModeEligibility: {
    draftInternalShare: {
      eligible: boolean;
      blockingReasons: string[];
      warningReasons: string[];
    };
    publicationIntent: {
      eligible: boolean;
      blockingReasons: string[];
      warningReasons: string[];
    };
  };
  publicationReadiness: {
    ready: boolean;
    reasons: string[];
  };
  finalIntentStatus: "not_confirmed" | "confirmed_current" | "stale_reconfirmation_required";
  lastHumanApprovalRef?: {
    approvalEventId: string;
    approvedAt: string;
    targetSnapshotRef?: string;
    actorId: string;
  };
  basedOnSnapshotRef: string;
  updatedAt: string;
};
type ManuscriptTrustReadiness = {
  manuscriptId: string;
  finalIntentStatus: "not_confirmed" | "confirmed_current" | "stale_reconfirmation_required";
  exportModeEligibility: {
    draftInternalShare: {
      eligible: boolean;
      blockingReasons: string[];
      warningReasons: string[];
    };
    publicationIntent: {
      eligible: boolean;
      blockingReasons: string[];
      warningReasons: string[];
    };
  };
};
type ExportReadiness = { canExport: boolean; blockingReasons: string[]; warnings: string[] };
type ExportAttemptResult = {
  exportMode: "draft_internal" | "publication_intent";
  exportOutcome: {
    status: "allowed" | "warning_bearing_but_allowed" | "blocked" | "stale_reapproval_required";
    blockingReasons: string[];
    warningReasons: string[];
  };
  exportPackage: {
    id: string;
    status: string;
    readinessReport: ExportReadiness;
    artifactPointer?: string;
  };
  renderedText?: string;
};
type GraphPayload = {
  manuscript: ManuscriptSummary & { abstract?: string; keywords?: string[] };
  sections: Section[];
  claims: Claim[];
  evidence: Evidence[];
  figures: Figure[];
  methods: MethodBlock[];
  limitations: Limitation[];
  approvals: Array<{ id: string; approvalType: string; actorId: string; targetEntityType: string; targetEntityId: string; approved: boolean; createdAt: string }>;
  aiReviewResults: AIReviewResult[];
  validityAssessments: ClaimValidityAssessment[];
  claimFramingAssessments?: ClaimFramingAssessment[];
  claimTrustReadiness: ClaimTrustReadiness[];
  manuscriptTrustReadiness: ManuscriptTrustReadiness;
  exportReadiness: ExportReadiness;
};
type ClaimFramingAssessment = {
  assessmentId: string;
  claimId: string;
  suggestedClaimType: string;
  suggestedStrengthLevel: string;
  rationale: string;
  cues: string[];
  modelConfidence: number;
  sourceMode: string;
  generatedAt: string;
};
type StructuredView = { manuscript?: ManuscriptSummary; sections?: Section[]; renderedText: string; objectCounts: Record<string, number> };
type ClaimCreateResponse = { claim: Claim };
type ClaimUpdateResponse = { claim: Claim };
type EvidenceResponse = { evidence: Evidence };
type SectionResponse = { section: Section };

const NEW_SECTION_VALUE = "__new_section__";

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: unknown };

  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Request failed with status ${response.status}.`);
  }

  return payload;
}

function claimTitle(text: string) {
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function validityBandLabel(band: ClaimValidityAssessment["scoreBand"]) {
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function staleReasonLabel(reason: string) {
  switch (reason) {
    case "claim_text_or_claim_strength_changed":
      return "Claim wording, type, or strength changed after this assessment.";
    case "evidence_bundle_changed":
      return "Evidence content or evidence-link state changed after this assessment.";
    case "method_context_changed":
      return "Method context changed after this assessment.";
    case "limitation_context_changed":
      return "Limitation context changed after this assessment.";
    case "figure_context_changed":
      return "Figure context changed after this assessment.";
    case "citation_context_changed":
      return "Citation context changed after this assessment.";
    default:
      return reason;
  }
}

function trustStaleReasonLabel(reason: string) {
  switch (reason) {
    case "support_bundle_changed_after_human_approval":
      return "The support bundle changed after the last human approval.";
    case "human_approval_missing_snapshot_reference":
      return "The last human approval is missing a verifiable snapshot reference.";
    default:
      return reason.replaceAll("_", " ");
  }
}

function exportOutcomeLabel(status: ExportAttemptResult["exportOutcome"]["status"]) {
  switch (status) {
    case "allowed":
      return "Allowed";
    case "warning_bearing_but_allowed":
      return "Allowed with warnings";
    case "stale_reapproval_required":
      return "Blocked - stale and needs reapproval";
    default:
      return "Blocked";
  }
}

export default function WorkspaceClient() {
  const [manuscripts, setManuscripts] = useState<ManuscriptSummary[]>([]);
  const [selectedManuscriptId, setSelectedManuscriptId] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [view, setView] = useState<StructuredView | null>(null);
  const [membership, setMembership] = useState<MembershipContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading manuscript workspace...");
  const [newClaimForm, setNewClaimForm] = useState({ text: "" });
  const [claimForm, setClaimForm] = useState({ text: "" });
  const [evidenceForm, setEvidenceForm] = useState({ summary: "", evidenceType: "observation", confidenceNotes: "" });
  const [newEvidenceForm, setNewEvidenceForm] = useState({ summary: "", evidenceType: "observation", confidenceNotes: "" });
  const [sectionPlacement, setSectionPlacement] = useState(NEW_SECTION_VALUE);
  const [newSectionTitle, setNewSectionTitle] = useState("Results");
  const [claimCreating, setClaimCreating] = useState(false);
  const [claimSaving, setClaimSaving] = useState(false);
  const [evidenceSaving, setEvidenceSaving] = useState(false);
  const [sectionSaving, setSectionSaving] = useState(false);
  const [validityAssessing, setValidityAssessing] = useState(false);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [claimApproving, setClaimApproving] = useState(false);
  const [evidenceApproving, setEvidenceApproving] = useState(false);
  const [publicationReadyMarking, setPublicationReadyMarking] = useState(false);
  const [finalIntentConfirming, setFinalIntentConfirming] = useState(false);
  const [draftExporting, setDraftExporting] = useState(false);
  const [publicationExporting, setPublicationExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportAttemptResult | null>(null);

  async function refreshWorkspace(manuscriptId = selectedManuscriptId) {
    if (!manuscriptId) {
      setGraph(null);
      setView(null);
      setMembership(null);
      return;
    }

    const [graphPayload, viewPayload] = await Promise.all([
      readJson<GraphPayload>(`/api/manuscripts?manuscriptId=${manuscriptId}`),
      readJson<StructuredView>(`/api/manuscript-view?manuscriptId=${manuscriptId}`)
    ]);

    setGraph(graphPayload);
    setView(viewPayload);

    try {
      const sessionPayload = await readJson<{ membership: MembershipContext }>(`/api/session?manuscriptId=${manuscriptId}`);
      setMembership(sessionPayload.membership);
    } catch {
      setMembership(null);
    }
  }

  async function refreshManuscripts() {
    const payload = await readJson<{ manuscripts: ManuscriptSummary[] }>("/api/manuscripts");
    setManuscripts(payload.manuscripts);
    return payload.manuscripts;
  }

  async function performAction(action: () => Promise<void>, successMessage: string, setBusy?: (value: boolean) => void) {
    try {
      setBusy?.(true);
      await action();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy?.(false);
    }
  }

  async function requestExport(mode: "draft_internal" | "publication_intent") {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manuscriptId: selectedManuscriptId,
        mode
      })
    });
    const payload = (await response.json().catch(() => ({}))) as ExportAttemptResult & { error?: unknown };

    if (!response.ok) {
      if (payload.exportPackage) {
        setExportResult(payload);
        throw new Error(
          payload.exportOutcome.blockingReasons.join(" ") || `Export failed with status ${response.status}.`
        );
      }

      throw new Error(typeof payload.error === "string" ? payload.error : `Export failed with status ${response.status}.`);
    }

    setExportResult(payload);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const availableManuscripts = await refreshManuscripts();
        const nextManuscriptId = selectedManuscriptId || availableManuscripts[0]?.id || "";
        setSelectedManuscriptId(nextManuscriptId);

        if (nextManuscriptId) {
          await refreshWorkspace(nextManuscriptId);
          setMessage("Manuscript workspace loaded.");
        } else {
          setMessage("No manuscripts yet. For now, create or seed one through the internal QA flow, then return here.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Workspace failed to load.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!selectedManuscriptId) return;

    setExportResult(null);
    setLoading(true);
    void refreshWorkspace(selectedManuscriptId)
      .then(() => setMessage("Manuscript workspace updated."))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Workspace failed to refresh."))
      .finally(() => setLoading(false));
  }, [selectedManuscriptId]);

  useEffect(() => {
    if (!graph?.claims.length) {
      setSelectedClaimId("");
      return;
    }

    if (!graph.claims.some((claim) => claim.id === selectedClaimId)) {
      setSelectedClaimId(graph.claims[0].id);
    }
  }, [graph, selectedClaimId]);

  const activeClaim = useMemo(
    () => graph?.claims.find((claim) => claim.id === selectedClaimId) ?? graph?.claims[0] ?? null,
    [graph, selectedClaimId]
  );

  const activeClaimValidity = useMemo(
    () => graph?.validityAssessments.find((assessment) => assessment.claimId === activeClaim?.id) ?? null,
    [graph?.validityAssessments, activeClaim?.id]
  );
  const activeClaimFraming = useMemo(
    () => graph?.claimFramingAssessments?.find((assessment) => assessment.claimId === activeClaim?.id) ?? null,
    [graph?.claimFramingAssessments, activeClaim?.id]
  );
  const activeClaimTrust = useMemo(
    () => graph?.claimTrustReadiness.find((assessment) => assessment.claimId === activeClaim?.id) ?? null,
    [graph?.claimTrustReadiness, activeClaim?.id]
  );

  const activeSectionContext = useMemo(() => {
    if (!graph || !activeClaim) return [];
    return graph.sections.filter((section) => section.objectRefs.some((ref) => ref.entityType === "claim" && ref.entityId === activeClaim.id));
  }, [graph, activeClaim]);

  const activeEvidence = useMemo(() => {
    if (!graph || !activeClaim) return [];
    const linkedIds = new Set(activeClaim.linkedEvidence.map((link) => link.evidenceId));
    return graph.evidence.filter((item) => linkedIds.has(item.id));
  }, [graph, activeClaim]);

  const activeFigures = useMemo(() => {
    if (!graph || !activeClaim) return [];
    const sourceFigureIds = new Set(activeClaim.sourceFigures.map((link) => link.entityId).filter(Boolean));
    return graph.figures.filter((figure) => sourceFigureIds.has(figure.id) || figure.linkedClaimIds.includes(activeClaim.id));
  }, [graph, activeClaim]);

  const activeMethods = useMemo(() => {
    if (!graph || !activeClaim) return [];
    const linkedIds = new Set(activeClaim.linkedMethods.map((link) => link.entityId).filter(Boolean));
    return graph.methods.filter((method) => linkedIds.has(method.id) || method.linkedClaimIds.includes(activeClaim.id));
  }, [graph, activeClaim]);

  const activeLimitations = useMemo(() => {
    if (!graph || !activeClaim) return [];
    const linkedIds = new Set(activeClaim.linkedLimitations.map((link) => link.entityId).filter(Boolean));
    return graph.limitations.filter((limitation) => linkedIds.has(limitation.id) || limitation.linkedClaimIds.includes(activeClaim.id));
  }, [graph, activeClaim]);

  const activeReviewResults = useMemo(() => {
    if (!graph || !activeClaim) return [];
    const entityIds = new Set<string>([
      activeClaim.id,
      ...activeEvidence.map((item) => item.id),
      ...activeFigures.map((item) => item.id),
      ...activeMethods.map((item) => item.id),
      ...activeLimitations.map((item) => item.id)
    ]);
    return graph.aiReviewResults.filter((result) => result.linkedEntityIds.some((id) => entityIds.has(id)));
  }, [graph, activeClaim, activeEvidence, activeFigures, activeMethods, activeLimitations]);

  const activeEvidenceItem = useMemo(
    () => activeEvidence.find((item) => item.id === selectedEvidenceId) ?? activeEvidence[0] ?? null,
    [activeEvidence, selectedEvidenceId]
  );

  const claimSummaries = useMemo(() => {
    return (graph?.claims ?? []).map((claim) => {
      const linkedReviewResults = (graph?.aiReviewResults ?? []).filter((result) => result.linkedEntityIds.includes(claim.id));
      const trust = (graph?.claimTrustReadiness ?? []).find((item) => item.claimId === claim.id);
      const validity = (graph?.validityAssessments ?? []).find((assessment) => assessment.claimId === claim.id);
      const confirmedEvidenceCount = claim.linkedEvidence.filter((link) => link.status === "confirmed").length;
      const proposedEvidenceCount = claim.linkedEvidence.filter((link) => link.status !== "confirmed").length;

      return {
        claim,
        validity,
        trust,
        confirmedEvidenceCount,
        proposedEvidenceCount,
        hasBlockingReview: linkedReviewResults.some((result) => result.severity === "blocking")
      };
    });
  }, [graph?.claims, graph?.aiReviewResults, graph?.claimTrustReadiness, graph?.validityAssessments]);

  useEffect(() => {
    if (!activeClaim) {
      setClaimForm({ text: "" });
      return;
    }

    setClaimForm({
      text: activeClaim.text
    });
  }, [activeClaim?.id, activeClaim?.text]);

  useEffect(() => {
    if (!activeEvidence.length) {
      setSelectedEvidenceId("");
      setEvidenceForm({ summary: "", evidenceType: "observation", confidenceNotes: "" });
      return;
    }

    if (!activeEvidence.some((item) => item.id === selectedEvidenceId)) {
      setSelectedEvidenceId(activeEvidence[0].id);
      return;
    }

    if (activeEvidenceItem) {
      setEvidenceForm({
        summary: activeEvidenceItem.summary,
        evidenceType: activeEvidenceItem.evidenceType,
        confidenceNotes: activeEvidenceItem.confidenceNotes ?? ""
      });
    }
  }, [activeEvidence, selectedEvidenceId, activeEvidenceItem]);

  useEffect(() => {
    const currentSection = activeSectionContext[0];
    setSectionPlacement(currentSection?.id ?? NEW_SECTION_VALUE);
    setNewSectionTitle(currentSection?.title ?? "Results");
  }, [activeClaim?.id, activeSectionContext]);

  const sessionSummary = membership
    ? `${membership.actor.displayName} (${membership.manuscriptRole ?? "no manuscript role"})`
    : "No active author session";
  const actorId = membership?.actor.id;
  const canApproveClaim = Boolean(membership?.allowedActions?.canApproveClaim);
  const canApproveClaimEvidence = Boolean(membership?.allowedActions?.canApproveClaimEvidence);
  const canConfirmFinalIntent = Boolean(membership?.allowedActions?.canConfirmFinalIntent);
  const activeEvidenceLinkStatus = activeClaim && activeEvidenceItem
    ? activeClaim.linkedEvidence.find((link) => link.evidenceId === activeEvidenceItem.id)?.status ?? "proposed"
    : "proposed";
  const claimNeedsSectionPlacement = Boolean(activeClaimTrust?.blockers.some((item) => item.code === "missing_section_placement"));
  const staleMessages = [
    ...(activeClaimTrust?.staleReasons.map((reason) => trustStaleReasonLabel(reason)) ?? []),
    ...(activeClaimTrust?.aiReviewStatus === "stale_rerun_required" ? ["AI review is out of date for the current support bundle."] : []),
    ...(activeClaimValidity?.staleReasons.map((reason) => staleReasonLabel(reason)) ?? [])
  ];
  const nextActionRecommendation = (() => {
    if (!activeClaim) {
      return "Create or select a claim to begin assembling the manuscript.";
    }

    if (claimNeedsSectionPlacement) {
      return "Place this claim into a manuscript section so it becomes part of the paper.";
    }

    if (!activeClaimValidity) {
      return "Assess claim validity to get a scientific support read on the current claim bundle.";
    }

    if (activeClaimValidity.stale) {
      return "Refresh the validity assessment so it matches the current support bundle.";
    }

    if (!activeClaimTrust || activeClaimTrust.aiReviewStatus === "not_run") {
      return "Run AI review so the first-review checks are current for this claim bundle.";
    }

    if (activeClaimTrust.aiReviewStatus === "stale_rerun_required") {
      return "Rerun AI review because the claim bundle changed after the last review.";
    }

    if (activeEvidenceItem && activeEvidenceLinkStatus !== "confirmed") {
      return canApproveClaimEvidence
        ? "Confirm the selected evidence as support for this claim."
        : "Use an author session with manuscript authority to confirm this evidence link.";
    }

    if (activeClaimTrust.humanApprovalStatus !== "approved_current") {
      return canApproveClaim
        ? "Approve the claim as the current human-author judgment."
        : "Use an author session with manuscript authority to approve the claim.";
    }

    if (!activeClaimTrust.publicationReadiness.ready) {
      return activeClaimTrust.publicationReadiness.reasons[0] ?? "Resolve the remaining trust blockers for this claim.";
    }

    if (activeClaimTrust.finalIntentStatus !== "confirmed_current") {
      return canConfirmFinalIntent
        ? "Confirm manuscript publication intent before attempting publication export."
        : "A corresponding author or owner must confirm manuscript intent for publication export.";
    }

    if (activeClaimTrust.exportModeEligibility.publicationIntent.eligible) {
      return "This claim is ready for publication-intent export from the current manuscript state.";
    }

    if (activeClaimTrust.exportModeEligibility.draftInternalShare.eligible) {
      return "This claim can already be shared in a draft/internal export while publication blockers remain visible.";
    }

    return "Resolve the remaining blockers shown below to continue moving this claim forward.";
  })();
  const messageToneClass =
    message.toLowerCase().includes("failed") ||
    message.toLowerCase().includes("error") ||
    message.toLowerCase().includes("blocked") ||
    message.toLowerCase().includes("requires")
      ? "blocking"
      : "muted";

  return (
    <section>
      <p className="eyebrow">Author Workspace Prototype</p>
      <div className="workspace-header">
        <div>
          <h1>{graph?.manuscript.title ?? "Manuscript workspace"}</h1>
          <p className="muted">
            Claim-centric authoring prototype. Edit the current claim, add evidence, and place the claim into the
            manuscript while keeping the assembled paper visible.
          </p>
        </div>
        <div className="workspace-toolbar">
          <label>
            Manuscript
            <select value={selectedManuscriptId} onChange={(event) => setSelectedManuscriptId(event.target.value)}>
              <option value="">Select manuscript</option>
              {manuscripts.map((manuscript) => (
                <option key={manuscript.id} value={manuscript.id}>
                  {manuscript.title}
                </option>
              ))}
            </select>
          </label>
          <p className="muted workspace-session">{sessionSummary}</p>
        </div>
      </div>

      <p className={messageToneClass}>{message}</p>

      {!selectedManuscriptId && !loading ? (
        <article className="card workspace-empty">
          <h2>No manuscript available yet</h2>
          <p className="muted">
            This prototype opens directly into manuscript work once a manuscript exists. For now, create or seed one in{" "}
            <a href="/qa">/qa</a>, then return here.
          </p>
        </article>
      ) : null}

      <div className="workspace author-workspace">
        <aside className="card workspace-column workspace-left">
          <h2>Article map</h2>
          <div className="workspace-subsection workspace-subsection-first">
            <h3>New claim</h3>
            <label>
              Claim text
              <textarea
                value={newClaimForm.text}
                rows={4}
                onChange={(event) => setNewClaimForm({ ...newClaimForm, text: event.target.value })}
              />
            </label>
            <p className="muted">
              After you save the text, the system will judge claim type and strength and store that framing with the claim.
            </p>
            <button
              type="button"
              disabled={claimCreating || !selectedManuscriptId || !newClaimForm.text.trim()}
              onClick={() =>
                void performAction(
                  async () => {
                    const payload = await readJson<ClaimCreateResponse>("/api/claims", {
                      method: "POST",
                      body: JSON.stringify({
                        manuscriptId: selectedManuscriptId,
                        text: newClaimForm.text
                      })
                    });
                    setNewClaimForm({ text: "" });
                    setSelectedClaimId(payload.claim.id);
                    await refreshWorkspace(selectedManuscriptId);
                  },
                  "New claim created and opened in the workspace.",
                  setClaimCreating
                )
              }
            >
              {claimCreating ? "Creating claim..." : "Create claim"}
            </button>
          </div>

          <h3>Sections</h3>
          {(graph?.sections ?? []).length ? (
            graph?.sections.map((section, index) => {
              const containsActiveClaim = Boolean(
                activeClaim &&
                  section.objectRefs.some((ref) => ref.entityType === "claim" && ref.entityId === activeClaim.id)
              );

              return (
                <div key={section.id} className={`workspace-list-item${containsActiveClaim ? " workspace-list-item-active" : ""}`}>
                  <p>
                    {section.orderIndex ?? index + 1}. {section.title}
                  </p>
                  <p className="muted">{section.objectRefs.length} linked objects</p>
                </div>
              );
            })
          ) : (
            <p className="muted">No sections assembled yet.</p>
          )}

          <h3>Claims</h3>
          {claimSummaries.length ? (
            <div className="workspace-claim-list">
              {claimSummaries.map(({ claim, validity, trust, confirmedEvidenceCount, proposedEvidenceCount, hasBlockingReview }) => {
                const isActive = activeClaim?.id === claim.id;

                return (
                  <button
                    key={claim.id}
                    type="button"
                    className={`workspace-claim-button${isActive ? " workspace-claim-button-active" : ""}`}
                    onClick={() => setSelectedClaimId(claim.id)}
                  >
                    <strong>{claimTitle(claim.text)}</strong>
                    <span className="workspace-claim-meta">
                      <span className={claim.authorApproved ? "pill" : "warning"}>
                        {claim.authorApproved ? "approved" : "approval needed"}
                      </span>
                      <span className={confirmedEvidenceCount > 0 ? "pill" : "warning"}>
                        {confirmedEvidenceCount > 0 ? `${confirmedEvidenceCount} confirmed evidence` : "evidence needed"}
                      </span>
                      {proposedEvidenceCount > 0 ? (
                        <span className="warning">{proposedEvidenceCount} unconfirmed link</span>
                      ) : null}
                      {validity ? (
                        <span className={validity.stale ? "warning" : "pill"}>
                          validity: {validityBandLabel(validity.scoreBand)}
                          {validity.stale ? " (stale)" : ""}
                        </span>
                      ) : (
                        <span className="muted">validity not assessed</span>
                      )}
                      <span className={trust?.publicationReadiness.ready ? "pill" : trust?.blockers.length || hasBlockingReview ? "warning" : "muted"}>
                        {trust?.publicationReadiness.ready
                          ? "publication-ready"
                          : trust?.blockers.length
                            ? `${trust.lifecycleState.replaceAll("_", " ")}`
                            : claim.status}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted">No claims yet.</p>
          )}
        </aside>
        <article className="card workspace-column workspace-center">
          <h2>Current claim</h2>
          {activeClaim ? (
            <>
              <div className="workspace-subsection workspace-subsection-first">
                <h3>Claim draft</h3>
                <label>
                  Claim text
                  <textarea
                    value={claimForm.text}
                    rows={5}
                    onChange={(event) => setClaimForm({ ...claimForm, text: event.target.value })}
                  />
                </label>
                <div className="workspace-object-card">
                  <p>
                    <strong>AI claim framing</strong>
                  </p>
                  <p className="muted">
                    Type: {activeClaimFraming?.suggestedClaimType ?? activeClaim.claimType} | Strength:{" "}
                    {activeClaimFraming?.suggestedStrengthLevel ?? activeClaim.strengthLevel}
                  </p>
                  {activeClaimFraming ? (
                    <>
                      <p className="muted">{activeClaimFraming.rationale}</p>
                      <p className="muted">
                        Source: {activeClaimFraming.sourceMode} | Confidence:{" "}
                        {Math.round(activeClaimFraming.modelConfidence * 100)}%
                      </p>
                    </>
                  ) : (
                    <p className="muted">Save the claim text to generate a framing assessment.</p>
                  )}
                </div>
                <div className="workspace-inline-status">
                  <span className={activeClaimTrust?.lifecycleState === "publication_ready" ? "pill" : "warning"}>
                    {activeClaimTrust?.lifecycleState.replaceAll("_", " ") ?? activeClaim.status}
                  </span>
                  <span className={activeClaimTrust?.humanApprovalStatus === "approved_current" ? "pill" : "warning"}>
                    {activeClaimTrust?.humanApprovalStatus === "approved_current" ? "human approval current" : "approval not current"}
                  </span>
                  <span className={activeClaimTrust?.publicationReadiness.ready ? "pill" : "warning"}>
                    {activeClaimTrust?.publicationReadiness.ready ? "publication-ready" : "not publication-ready"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={
                    claimSaving ||
                    !claimForm.text.trim() ||
                    claimForm.text === activeClaim.text
                  }
                  onClick={() =>
                    void performAction(
                      async () => {
                        await readJson<ClaimUpdateResponse>("/api/claims", {
                          method: "PATCH",
                          body: JSON.stringify({
                            claimId: activeClaim.id,
                            text: claimForm.text
                          })
                        });
                        await refreshWorkspace(selectedManuscriptId);
                      },
                      "Claim saved and manuscript preview refreshed.",
                      setClaimSaving
                    )
                  }
                >
                  {claimSaving ? "Saving claim..." : "Save claim"}
                </button>
              </div>

              <div className="workspace-subsection">
                <h3>Claim workflow</h3>
                <p className="muted">
                  Move this claim through support assessment, first review, human approval, and export readiness without
                  leaving the manuscript workspace.
                </p>
                <div className="workspace-object-card">
                  <p>
                    <strong>Next action</strong>
                  </p>
                  <p>{nextActionRecommendation}</p>
                  <div className="workspace-inline-status">
                    <span className={activeClaimValidity ? "pill" : "warning"}>
                      validity {activeClaimValidity ? validityBandLabel(activeClaimValidity.scoreBand) : "not assessed"}
                    </span>
                    <span className={activeClaimTrust?.aiReviewStatus === "completed_current" ? "pill" : "warning"}>
                      AI review {activeClaimTrust?.aiReviewStatus.replaceAll("_", " ") ?? "not run"}
                    </span>
                    <span className={activeClaimTrust?.humanApprovalStatus === "approved_current" ? "pill" : "warning"}>
                      human approval {activeClaimTrust?.humanApprovalStatus.replaceAll("_", " ") ?? "missing"}
                    </span>
                    <span className={activeClaimTrust?.stale ? "warning" : "pill"}>
                      {activeClaimTrust?.stale ? "reapproval required" : "support snapshot current"}
                    </span>
                  </div>
                  {staleMessages.length ? (
                    <div>
                      <p className="warning">This claim bundle is out of date in one or more trust/validity checks.</p>
                      {staleMessages.map((item) => (
                        <p key={item} className="muted">
                          {item}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <div className="qa-inline">
                    <button
                      type="button"
                      disabled={validityAssessing || !activeClaim}
                      onClick={() =>
                        void performAction(
                          async () => {
                            await readJson<{ validityAssessment: ClaimValidityAssessment }>("/api/validity", {
                              method: "POST",
                              body: JSON.stringify({
                                manuscriptId: selectedManuscriptId,
                                claimId: activeClaim.id
                              })
                            });
                            await refreshWorkspace(selectedManuscriptId);
                          },
                          activeClaimValidity
                            ? "Validity assessment refreshed for the active claim."
                            : "Validity assessment created for the active claim.",
                          setValidityAssessing
                        )
                      }
                    >
                      {validityAssessing
                        ? "Refreshing validity..."
                        : activeClaimValidity
                          ? "Refresh validity"
                          : "Assess validity"}
                    </button>
                    <button
                      type="button"
                      disabled={reviewRunning || !selectedManuscriptId}
                      onClick={() =>
                        void performAction(
                          async () => {
                            await readJson<{ results: AIReviewResult[] }>("/api/ai-review", {
                              method: "POST",
                              body: JSON.stringify({ manuscriptId: selectedManuscriptId })
                            });
                            await refreshWorkspace(selectedManuscriptId);
                          },
                          "AI review refreshed for the manuscript claim bundle.",
                          setReviewRunning
                        )
                      }
                    >
                      {reviewRunning ? "Refreshing AI review..." : "Refresh AI review"}
                    </button>
                  </div>
                  <div className="qa-inline">
                    <button
                      type="button"
                      disabled={claimApproving || !activeClaim || !canApproveClaim}
                      onClick={() =>
                        void performAction(
                          async () => {
                            await readJson<{ claim: Claim }>("/api/approvals", {
                              method: "POST",
                              body: JSON.stringify({
                                approvalType: "claim_approval",
                                targetEntityId: activeClaim.id
                              })
                            });
                            await refreshWorkspace(selectedManuscriptId);
                          },
                          "Human claim approval recorded.",
                          setClaimApproving
                        )
                      }
                    >
                      {claimApproving ? "Approving claim..." : "Approve claim"}
                    </button>
                    <button
                      type="button"
                      disabled={evidenceApproving || !activeClaim || !activeEvidenceItem || !canApproveClaimEvidence}
                      onClick={() =>
                        void performAction(
                          async () => {
                            await readJson<{ claim: Claim }>("/api/approvals", {
                              method: "POST",
                              body: JSON.stringify({
                                approvalType: "claim_evidence_approval",
                                targetEntityId: activeClaim.id,
                                evidenceId: activeEvidenceItem.id
                              })
                            });
                            await refreshWorkspace(selectedManuscriptId);
                          },
                          "Selected evidence confirmed as support for this claim.",
                          setEvidenceApproving
                        )
                      }
                    >
                      {evidenceApproving ? "Confirming evidence..." : "Confirm selected evidence"}
                    </button>
                    <button
                      type="button"
                      disabled={publicationReadyMarking || !activeClaim || !canApproveClaim}
                      onClick={() =>
                        void performAction(
                          async () => {
                            await readJson<{ claim: Claim }>("/api/approvals", {
                              method: "POST",
                              body: JSON.stringify({
                                approvalType: "claim_publication_ready",
                                targetEntityId: activeClaim.id
                              })
                            });
                            await refreshWorkspace(selectedManuscriptId);
                          },
                          "Claim marked publication-ready through the trust contract.",
                          setPublicationReadyMarking
                        )
                      }
                    >
                      {publicationReadyMarking ? "Checking readiness..." : "Mark publication-ready"}
                    </button>
                  </div>
                  {!canApproveClaim || !canApproveClaimEvidence ? (
                    <p className="muted">
                      Approval actions require an active manuscript-author session. Use <a href="/qa">/qa</a> only if
                      you need to switch development sessions.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="workspace-subsection">
                <h3>Claim trust and readiness</h3>
                <p className="muted">
                  Trust/readiness is separate from validity. It answers whether this claim is approved, current,
                  blocked, draft-exportable, and publication-ready.
                </p>
                {activeClaimTrust ? (
                  <div className="workspace-object-card">
                    <div className="workspace-inline-status">
                      <span className={activeClaimTrust.publicationReadiness.ready ? "pill" : "warning"}>
                        {activeClaimTrust.lifecycleState.replaceAll("_", " ")}
                      </span>
                      <span className={activeClaimTrust.humanApprovalStatus === "approved_current" ? "pill" : "warning"}>
                        human approval: {activeClaimTrust.humanApprovalStatus.replaceAll("_", " ")}
                      </span>
                      <span
                        className={
                          activeClaimTrust.aiReviewStatus === "completed_current" ? "pill" : "warning"
                        }
                      >
                        AI review: {activeClaimTrust.aiReviewStatus.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className={activeClaimTrust.exportModeEligibility.draftInternalShare.eligible ? "pill" : "warning"}>
                      Draft/internal sharing: {activeClaimTrust.exportModeEligibility.draftInternalShare.eligible ? "eligible" : "blocked"}
                    </p>
                    <p className={activeClaimTrust.exportModeEligibility.publicationIntent.eligible ? "pill" : "warning"}>
                      Publication-intent export: {activeClaimTrust.exportModeEligibility.publicationIntent.eligible ? "eligible" : "blocked"}
                    </p>
                    <p className={activeClaimTrust.publicationReadiness.ready ? "pill" : "warning"}>
                      Publication-ready: {activeClaimTrust.publicationReadiness.ready ? "yes" : "no"}
                    </p>
                    {activeClaimTrust.stale || activeClaimTrust.aiReviewStatus === "stale_rerun_required" ? (
                      <div>
                        <p className="warning">
                          {activeClaimTrust.stale
                            ? "Reapproval is required because the approved support bundle changed."
                            : "AI review is no longer current for the latest support bundle."}
                        </p>
                        {activeClaimTrust.staleReasons.map((reason) => (
                          <p key={reason} className="muted">
                            {trustStaleReasonLabel(reason)}
                          </p>
                        ))}
                        {activeClaimTrust.aiReviewStatus === "stale_rerun_required" ? (
                          <p className="muted">Rerun AI review to refresh the current first-review state.</p>
                        ) : null}
                      </div>
                    ) : null}
                    {activeClaimTrust.blockers.length ? (
                      activeClaimTrust.blockers.map((item) => (
                        <p className="blocking" key={item.code}>
                          {item.message}
                        </p>
                      ))
                    ) : (
                      <p className="pill">No active trust blockers for this claim.</p>
                    )}
                    {activeClaimTrust.warnings.map((item) => (
                      <p className="warning" key={item.code}>
                        {item.message}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No trust/readiness contract is available for this claim yet.</p>
                )}
              </div>

              <div className="workspace-subsection">
                <h3>Claim validity</h3>
                <p className="muted">
                  Validity assesses how well this claim bundle is scientifically supported. It is separate from human
                  approval, readiness, and export status.
                </p>
                {activeClaimValidity ? (
                  <div className="workspace-object-card">
                    <div className="workspace-inline-status">
                      <span className="pill">
                        {validityBandLabel(activeClaimValidity.scoreBand)} ({activeClaimValidity.overallValidityScore})
                      </span>
                      <span className={activeClaimValidity.stale ? "warning" : "pill"}>
                        {activeClaimValidity.stale ? `out of date: ${activeClaimValidity.freshnessStatus}` : "current support snapshot"}
                      </span>
                      <span className="pill">confidence {Math.round(activeClaimValidity.modelConfidence * 100)}%</span>
                    </div>
                    <p>{activeClaimValidity.summaryForUser}</p>
                    <p className="muted">Generated {new Date(activeClaimValidity.generatedAt).toLocaleString()}</p>
                    {activeClaimValidity.staleReasons.length ? (
                      <div>
                        <p className="warning">This assessment is no longer current for the active support bundle.</p>
                        {activeClaimValidity.staleReasons.map((reason) => (
                          <p key={reason} className="muted">
                            {staleReasonLabel(reason)}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {activeClaimValidity.majorConcerns.length ? (
                      <div>
                        <p>
                          <strong>Main concerns</strong>
                        </p>
                        {activeClaimValidity.majorConcerns.map((concern) => (
                          <p key={concern} className="warning">
                            {concern}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {activeClaimValidity.suggestedNextActions.length ? (
                      <div>
                        <p>
                          <strong>Suggested next actions</strong>
                        </p>
                        {activeClaimValidity.suggestedNextActions.map((action) => (
                          <p key={action} className="muted">
                            {action}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <details>
                      <summary>Why this score exists</summary>
                      <div className="workspace-subsection">
                        {Object.entries(activeClaimValidity.expandableDimensions).map(([dimensionKey, dimension]) => (
                          <div key={dimensionKey} className="workspace-object-card">
                            <p>
                              <strong>{dimensionKey}</strong> | {dimension.score}
                            </p>
                            <p>{dimension.rationale}</p>
                            {dimension.drivers.map((driver) => (
                              <p key={driver} className="muted">
                                {driver}
                              </p>
                            ))}
                          </div>
                        ))}
                        {activeClaimValidity.biggestScoreDrivers.length ? (
                          <div className="workspace-object-card">
                            <p>
                              <strong>Biggest score drivers</strong>
                            </p>
                            {activeClaimValidity.biggestScoreDrivers.map((driver) => (
                              <p key={driver} className="muted">
                                {driver}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </div>
                ) : (
                  <p className="muted">No validity assessment has been generated for this claim yet.</p>
                )}
              </div>

              <div className="workspace-subsection">
                <h3>Linked evidence</h3>
                <p className="muted">
                  Evidence supports the active claim only after the link is confirmed. Proposed links are visible here,
                  but they do not yet satisfy claim readiness.
                </p>
                {activeEvidence.length ? (
                  <>
                    <label>
                      Evidence linked to this claim
                      <select value={selectedEvidenceId} onChange={(event) => setSelectedEvidenceId(event.target.value)}>
                        {activeEvidence.map((item) => {
                          const linkStatus =
                            activeClaim.linkedEvidence.find((link) => link.evidenceId === item.id)?.status ?? "proposed";

                          return (
                            <option key={item.id} value={item.id}>
                              {item.evidenceType} | {linkStatus === "confirmed" ? "confirmed" : "linked only"} | {claimTitle(item.summary)}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    {activeEvidenceItem ? (
                      <div className="workspace-object-card">
                        <div className="workspace-inline-status">
                          <span className={activeClaim.linkedEvidence.find((link) => link.evidenceId === activeEvidenceItem.id)?.status === "confirmed" ? "pill" : "warning"}>
                            {activeClaim.linkedEvidence.find((link) => link.evidenceId === activeEvidenceItem.id)?.status === "confirmed"
                              ? "confirmed support"
                              : "linked only - confirmation missing"}
                          </span>
                          <span className="pill">{activeEvidenceItem.evidenceType}</span>
                        </div>
                        <label>
                          Evidence summary
                          <textarea
                            value={evidenceForm.summary}
                            rows={4}
                            onChange={(event) => setEvidenceForm({ ...evidenceForm, summary: event.target.value })}
                          />
                        </label>
                        <div className="qa-inline">
                          <label>
                            Evidence type
                            <select
                              value={evidenceForm.evidenceType}
                              onChange={(event) => setEvidenceForm({ ...evidenceForm, evidenceType: event.target.value })}
                            >
                              <option value="figure">figure</option>
                              <option value="dataset">dataset</option>
                              <option value="table">table</option>
                              <option value="method">method</option>
                              <option value="citation">citation</option>
                              <option value="note">note</option>
                              <option value="observation">observation</option>
                            </select>
                          </label>
                          <label>
                            Confidence notes
                            <input
                              value={evidenceForm.confidenceNotes}
                              onChange={(event) => setEvidenceForm({ ...evidenceForm, confidenceNotes: event.target.value })}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          disabled={
                            evidenceSaving ||
                            !evidenceForm.summary.trim() ||
                            (evidenceForm.summary === activeEvidenceItem.summary &&
                              evidenceForm.evidenceType === activeEvidenceItem.evidenceType &&
                              evidenceForm.confidenceNotes === (activeEvidenceItem.confidenceNotes ?? ""))
                          }
                          onClick={() =>
                            void performAction(
                              async () => {
                                await readJson<EvidenceResponse>("/api/evidence", {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    evidenceId: activeEvidenceItem.id,
                                    summary: evidenceForm.summary,
                                    evidenceType: evidenceForm.evidenceType,
                                    confidenceNotes: evidenceForm.confidenceNotes || undefined,
                                    updatedBy: actorId
                                  })
                                });
                                await refreshWorkspace(selectedManuscriptId);
                              },
                              "Evidence saved and manuscript preview refreshed.",
                              setEvidenceSaving
                            )
                          }
                        >
                          {evidenceSaving ? "Saving evidence..." : "Save evidence"}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="muted">No evidence linked yet.</p>
                )}
                <div className="workspace-object-card">
                  <h4>Create evidence for this claim</h4>
                  <p className="muted">New evidence is immediately linked to the active claim as a proposed support item.</p>
                  <label>
                    Evidence summary
                    <textarea
                      value={newEvidenceForm.summary}
                      rows={4}
                      onChange={(event) => setNewEvidenceForm({ ...newEvidenceForm, summary: event.target.value })}
                    />
                  </label>
                  <div className="qa-inline">
                    <label>
                      Evidence type
                      <select
                        value={newEvidenceForm.evidenceType}
                        onChange={(event) => setNewEvidenceForm({ ...newEvidenceForm, evidenceType: event.target.value })}
                      >
                        <option value="figure">figure</option>
                        <option value="dataset">dataset</option>
                        <option value="table">table</option>
                        <option value="method">method</option>
                        <option value="citation">citation</option>
                        <option value="note">note</option>
                        <option value="observation">observation</option>
                      </select>
                    </label>
                    <label>
                      Confidence notes
                      <input
                        value={newEvidenceForm.confidenceNotes}
                        onChange={(event) => setNewEvidenceForm({ ...newEvidenceForm, confidenceNotes: event.target.value })}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={evidenceSaving || !activeClaim || !newEvidenceForm.summary.trim()}
                    onClick={() =>
                      void performAction(
                        async () => {
                          const payload = await readJson<EvidenceResponse>("/api/evidence", {
                            method: "POST",
                            body: JSON.stringify({
                              manuscriptId: selectedManuscriptId,
                              summary: newEvidenceForm.summary,
                              evidenceType: newEvidenceForm.evidenceType,
                              linkedClaimIds: [activeClaim.id],
                              confidenceNotes: newEvidenceForm.confidenceNotes || undefined,
                              createdBy: actorId
                            })
                          });
                          setSelectedEvidenceId(payload.evidence.id);
                          setNewEvidenceForm({ summary: "", evidenceType: "observation", confidenceNotes: "" });
                          await refreshWorkspace(selectedManuscriptId);
                        },
                        "New evidence created for the active claim.",
                        setEvidenceSaving
                      )
                    }
                  >
                    {evidenceSaving ? "Saving evidence..." : "Create linked evidence"}
                  </button>
                </div>
              </div>

              <div className="workspace-subsection">
                <h3>Manuscript contribution</h3>
                <p className="muted">
                  Choose where this claim appears in the paper. This is the smallest editable manuscript assembly control
                  in the prototype.
                </p>
                <label>
                  Section placement
                  <select value={sectionPlacement} onChange={(event) => setSectionPlacement(event.target.value)}>
                    <option value={NEW_SECTION_VALUE}>Create or move to new section</option>
                    {(graph?.sections ?? []).map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.orderIndex ?? "?"}. {section.title}
                      </option>
                    ))}
                  </select>
                </label>
                {sectionPlacement === NEW_SECTION_VALUE ? (
                  <label>
                    New section title
                    <input value={newSectionTitle} onChange={(event) => setNewSectionTitle(event.target.value)} />
                  </label>
                ) : null}
                <button
                  type="button"
                  disabled={sectionSaving || !activeClaim || (sectionPlacement === NEW_SECTION_VALUE && !newSectionTitle.trim())}
                  onClick={() =>
                    void performAction(
                      async () => {
                        await readJson<SectionResponse>("/api/sections", {
                          method: "PATCH",
                          body: JSON.stringify({
                            manuscriptId: selectedManuscriptId,
                            claimId: activeClaim.id,
                            sectionId: sectionPlacement === NEW_SECTION_VALUE ? undefined : sectionPlacement,
                            sectionTitle: sectionPlacement === NEW_SECTION_VALUE ? newSectionTitle : undefined,
                            updatedBy: actorId
                          })
                        });
                        await refreshWorkspace(selectedManuscriptId);
                      },
                      "Claim placement saved and manuscript preview refreshed.",
                      setSectionSaving
                    )
                  }
                >
                  {sectionSaving ? "Applying placement..." : "Apply section placement"}
                </button>
              </div>

              <div className="workspace-subsection">
                <h3>Linked figures</h3>
                {activeFigures.length ? (
                  activeFigures.map((figure) => (
                    <div key={figure.id} className="workspace-object-card">
                      <p>
                        <strong>Figure {figure.figureNumber ?? "?"}</strong> | {figure.title}
                      </p>
                      <p className="muted">{figure.caption || "Caption not yet provided."}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">No figures linked yet.</p>
                )}
              </div>

              <div className="workspace-subsection">
                <h3>Method blocks</h3>
                {activeMethods.length ? (
                  activeMethods.map((method) => (
                    <div key={method.id} className="workspace-object-card">
                      <p>
                        <strong>{method.title}</strong>
                      </p>
                      <p className="muted">{method.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">No method blocks linked yet.</p>
                )}
              </div>

              <div className="workspace-subsection">
                <h3>Limitations</h3>
                {activeLimitations.length ? (
                  activeLimitations.map((limitation) => (
                    <div key={limitation.id} className="workspace-object-card">
                      <p>{limitation.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">No linked limitations yet.</p>
                )}
              </div>

              <div className="workspace-subsection">
                <h3>AI review summary</h3>
                {activeReviewResults.length ? (
                  activeReviewResults.map((result) => (
                    <div key={result.id} className="workspace-object-card">
                      <p className={result.severity === "blocking" ? "blocking" : result.severity === "warning" ? "warning" : "muted"}>
                        {result.ruleId}
                      </p>
                      <p>{result.message}</p>
                      <p className="muted">{result.recommendedAction}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">No AI review findings attached to this claim context yet.</p>
                )}
              </div>
            </>
          ) : (
            <p className="muted">Select a manuscript with at least one claim to open the workspace.</p>
          )}
        </article>

        <aside className="card workspace-column workspace-right">
          <h2>Manuscript preview</h2>
          <div className="workspace-subsection workspace-subsection-first">
            <h3>Section context</h3>
            {activeSectionContext.length ? (
              activeSectionContext.map((section) => (
                <div key={section.id} className="workspace-object-card">
                  <p>
                    <strong>{section.title}</strong>
                  </p>
                  <p className="muted">This claim is currently assembled into this manuscript section.</p>
                </div>
              ))
            ) : (
              <p className="muted">This claim has not been placed into a manuscript section yet.</p>
            )}
          </div>

          <div className="workspace-subsection">
            <h3>Current contribution</h3>
            {activeClaim ? (
              <div className="workspace-object-card">
                <p className="muted">Active claim</p>
                <p>{activeClaim.text}</p>
                <p className="muted">
                  Confirmed evidence: {activeClaim.linkedEvidence.filter((link) => link.status === "confirmed").length} | Linked
                  only: {activeClaim.linkedEvidence.filter((link) => link.status !== "confirmed").length}
                </p>
              </div>
            ) : (
              <p className="muted">Select a claim to inspect its manuscript contribution.</p>
            )}
          </div>

          <div className="workspace-subsection">
            <h3>Manuscript status</h3>
            <p className={graph?.manuscriptTrustReadiness.finalIntentStatus === "confirmed_current" ? "pill" : "warning"}>
              Final manuscript intent:{" "}
              {graph?.manuscriptTrustReadiness.finalIntentStatus?.replaceAll("_", " ") ?? "not confirmed"}
            </p>
            <p className={graph?.manuscriptTrustReadiness.exportModeEligibility.draftInternalShare.eligible ? "pill" : "warning"}>
              Draft/internal export:{" "}
              {graph?.manuscriptTrustReadiness.exportModeEligibility.draftInternalShare.eligible ? "eligible" : "blocked"}
            </p>
            {(graph?.manuscriptTrustReadiness.exportModeEligibility.draftInternalShare.blockingReasons ?? []).map((reason) => (
              <p className="blocking" key={`draft-${reason}`}>
                {reason}
              </p>
            ))}
            {(graph?.manuscriptTrustReadiness.exportModeEligibility.draftInternalShare.warningReasons ?? []).map((warning) => (
              <p className="warning" key={`draft-warning-${warning}`}>
                {warning}
              </p>
            ))}
            <p className={graph?.manuscriptTrustReadiness.exportModeEligibility.publicationIntent.eligible ? "pill" : "blocking"}>
              Publication-intent export:{" "}
              {graph?.manuscriptTrustReadiness.exportModeEligibility.publicationIntent.eligible ? "eligible" : "blocked"}
            </p>
            {(graph?.manuscriptTrustReadiness.exportModeEligibility.publicationIntent.blockingReasons ?? []).map((reason) => (
              <p className="blocking" key={reason}>
                {reason}
              </p>
            ))}
            {(graph?.manuscriptTrustReadiness.exportModeEligibility.publicationIntent.warningReasons ?? []).map((warning) => (
              <p className="warning" key={warning}>
                {warning}
              </p>
            ))}
            <div className="qa-inline">
              <button
                type="button"
                disabled={draftExporting || !selectedManuscriptId}
                onClick={() =>
                  void performAction(
                    async () => {
                      await requestExport("draft_internal");
                      await refreshWorkspace(selectedManuscriptId);
                    },
                    "Draft/internal export attempted from the current manuscript state.",
                    setDraftExporting
                  )
                }
              >
                {draftExporting ? "Preparing draft export..." : "Attempt draft/internal export"}
              </button>
              <button
                type="button"
                disabled={finalIntentConfirming || !selectedManuscriptId || !canConfirmFinalIntent}
                onClick={() =>
                  void performAction(
                    async () => {
                      await readJson<{ approvalEvent: { id: string } }>("/api/approvals", {
                        method: "POST",
                        body: JSON.stringify({
                          approvalType: "pre_export_intent_confirmation",
                          targetEntityId: selectedManuscriptId
                        })
                      });
                      await refreshWorkspace(selectedManuscriptId);
                    },
                    "Current manuscript intent confirmed for publication export.",
                    setFinalIntentConfirming
                  )
                }
              >
                {finalIntentConfirming ? "Confirming intent..." : "Confirm manuscript intent"}
              </button>
              <button
                type="button"
                disabled={publicationExporting || !selectedManuscriptId}
                onClick={() =>
                  void performAction(
                    async () => {
                      await requestExport("publication_intent");
                      await refreshWorkspace(selectedManuscriptId);
                    },
                    "Publication-intent export attempted from the current manuscript state.",
                    setPublicationExporting
                  )
                }
              >
                {publicationExporting ? "Preparing publication export..." : "Attempt publication-intent export"}
              </button>
            </div>
            {!canConfirmFinalIntent ? (
              <p className="muted">
                Confirming manuscript publication intent requires an owner or corresponding author session.
              </p>
            ) : null}
            {exportResult ? (
              <div className="workspace-object-card">
                <p>
                  <strong>
                    Last export attempt: {exportResult.exportMode === "draft_internal" ? "draft/internal" : "publication-intent"}
                  </strong>
                </p>
                <p
                  className={
                    exportResult.exportOutcome.status === "allowed"
                      ? "pill"
                      : exportResult.exportOutcome.status === "warning_bearing_but_allowed"
                        ? "warning"
                        : "blocking"
                  }
                >
                  {exportOutcomeLabel(exportResult.exportOutcome.status)}
                </p>
                {exportResult.exportOutcome.blockingReasons.map((reason) => (
                  <p key={reason} className="blocking">
                    {reason}
                  </p>
                ))}
                {exportResult.exportOutcome.warningReasons.map((reason) => (
                  <p key={reason} className="warning">
                    {reason}
                  </p>
                ))}
                {exportResult.renderedText ? (
                  <p className="muted">A placeholder compiled manuscript artifact was generated for this export mode.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="workspace-subsection">
            <h3>Structured preview</h3>
            <pre className="qa-pre workspace-preview">
              {view?.renderedText ?? "No assembled manuscript text yet. Add sections to place claims into the article."}
            </pre>
          </div>

          <div className="workspace-subsection">
            <h3>Preview counts</h3>
            <pre className="qa-pre">{JSON.stringify(view?.objectCounts ?? {}, null, 2)}</pre>
          </div>
        </aside>
      </div>
    </section>
  );
}
