"use client";

import { useEffect, useMemo, useState } from "react";

type Project = { id: string; name: string; description?: string };
type Manuscript = { id: string; projectId: string; title: string; articleType?: string };
type Author = { id: string; displayName: string; email?: string; orcid?: string };
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
type Approval = {
  id: string;
  approvalType: string;
  actorId: string;
  targetEntityType: string;
  targetEntityId: string;
  approved: boolean;
  createdAt: string;
};
type ReviewResult = {
  id: string;
  ruleId: string;
  severity: "info" | "warning" | "blocking";
  message: string;
  recommendedAction: string;
};
type Claim = {
  id: string;
  text: string;
  status: string;
  authorApproved: boolean;
  publicationReady: boolean;
  linkedEvidence: Array<{ evidenceId: string; status: string }>;
};
type Evidence = { id: string; summary: string; evidenceType: string; linkedClaimIds: string[] };
type Figure = { id: string; title: string; figureNumber?: string; linkedClaimIds: string[] };
type MethodBlock = { id: string; title: string; linkedClaimIds: string[] };
type Limitation = { id: string; text: string; linkedClaimIds: string[] };
type Section = { id: string; title: string; objectRefs: Array<{ entityType: string; entityId: string }> };
type ExportReadiness = { canExport: boolean; blockingReasons: string[]; warnings: string[] };
type ClaimTrustReadiness = {
  claimId: string;
  lifecycleState: string;
  aiReviewStatus: string;
  humanApprovalStatus: string;
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  stale: boolean;
  staleReasons: string[];
  exportEligibility: string;
  exportModeEligibility: {
    draftInternalShare: { eligible: boolean; blockingReasons: string[]; warningReasons: string[] };
    publicationIntent: { eligible: boolean; blockingReasons: string[]; warningReasons: string[] };
  };
  publicationReadiness: { ready: boolean; reasons: string[] };
  finalIntentStatus: string;
};
type ManuscriptTrustReadiness = {
  manuscriptId: string;
  finalIntentStatus: string;
  exportModeEligibility: {
    draftInternalShare: { eligible: boolean; blockingReasons: string[]; warningReasons: string[] };
    publicationIntent: { eligible: boolean; blockingReasons: string[]; warningReasons: string[] };
  };
};
type GraphPayload = {
  manuscript: Manuscript;
  sections: Section[];
  claims: Claim[];
  claimFramingAssessments?: Array<{
    claimId: string;
    suggestedClaimType: string;
    suggestedStrengthLevel: string;
    rationale: string;
    sourceMode: string;
    generatedAt: string;
  }>;
  evidence: Evidence[];
  figures: Figure[];
  methods: MethodBlock[];
  limitations: Limitation[];
  approvals: Approval[];
  auditLogs?: Array<{
    id: string;
    action: string;
    actorId: string;
    sourceClassification: string;
    targetEntityType: string;
    targetEntityId: string;
    createdAt: string;
  }>;
  aiReviewResults: ReviewResult[];
  claimTrustReadiness?: ClaimTrustReadiness[];
  manuscriptTrustReadiness?: ManuscriptTrustReadiness;
  authors?: Author[];
  projectMembers?: Array<{ authorId: string; role: string }>;
  manuscriptMembers?: Array<{ authorId: string; role: string }>;
  exportReadiness: ExportReadiness;
};
type StructuredView = {
  manuscript?: Manuscript;
  sections?: Section[];
  renderedText: string;
  objectCounts: Record<string, number>;
};
type ExportResult = {
  exportPackage: {
    id: string;
    status: string;
    readinessReport: ExportReadiness;
    artifactPointer?: string;
  };
  renderedText?: string;
  error?: string;
};

type QaHelperResponse = {
  ok: true;
  action: "reset" | "seed" | "bootstrap";
  project?: Project;
  manuscript?: Manuscript;
  authors?: {
    owner: Author;
    correspondingAuthor: Author;
    coauthor: Author;
  };
};

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: unknown };

  if (!response.ok) {
    const error = typeof payload.error === "string" ? payload.error : `Request failed with status ${response.status}.`;
    throw new Error(error);
  }

  return payload;
}

export default function QAClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedManuscriptId, setSelectedManuscriptId] = useState("");
  const [selectedAuthorId, setSelectedAuthorId] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const [selectedFigureId, setSelectedFigureId] = useState("");
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [selectedLimitationId, setSelectedLimitationId] = useState("");
  const [session, setSession] = useState<MembershipContext | null>(null);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [view, setView] = useState<StructuredView | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [feedback, setFeedback] = useState("Open this page, create or select a manuscript, and step through the QA flow.");
  const [loading, setLoading] = useState(false);

  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [manuscriptForm, setManuscriptForm] = useState({ title: "", abstract: "", keywords: "qa, manual test" });
  const [authorForm, setAuthorForm] = useState({
    displayName: "",
    email: "",
    orcid: "",
    memberRole: "coauthor"
  });
  const [claimForm, setClaimForm] = useState({
    text: ""
  });
  const [evidenceForm, setEvidenceForm] = useState({
    evidenceType: "figure",
    summary: "",
    confidenceNotes: ""
  });
  const [figureForm, setFigureForm] = useState({
    figureNumber: "1",
    title: "",
    caption: ""
  });
  const [methodForm, setMethodForm] = useState({
    title: "",
    content: ""
  });
  const [limitationForm, setLimitationForm] = useState({
    text: "",
    severityOrImportance: "moderate"
  });

  async function withFeedback(action: () => Promise<void>, success: string) {
    setLoading(true);
    try {
      await action();
      setFeedback(success);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function requestExport(confirmFinalIntent: boolean) {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        manuscriptId: selectedManuscriptId,
        confirmFinalIntent
      })
    });
    const payload = (await response.json().catch(() => ({}))) as ExportResult & { error?: unknown };

    if (!response.ok) {
      if (payload.exportPackage) {
        setExportResult(payload);
        throw new Error(
          payload.exportPackage.readinessReport.blockingReasons.join(" ") || `Export failed with status ${response.status}.`
        );
      }

      throw new Error(typeof payload.error === "string" ? payload.error : `Export failed with status ${response.status}.`);
    }

    setExportResult(payload);
  }

  async function runQaHelper(action: "reset" | "seed" | "bootstrap") {
    const payload = await readJson<QaHelperResponse>("/api/internal/qa", {
      method: "POST",
      body: JSON.stringify({ action })
    });

    if (action === "reset") {
      setSelectedProjectId("");
      setSelectedManuscriptId("");
      setSelectedAuthorId("");
      setSelectedClaimId("");
      setSelectedEvidenceId("");
      setSelectedFigureId("");
      setSelectedMethodId("");
      setSelectedLimitationId("");
      setSession(null);
      setGraph(null);
      setView(null);
      setExportResult(null);
      await refreshProjects();
      return;
    }

    if (payload.project?.id) {
      setSelectedProjectId(payload.project.id);
    }
    if (payload.manuscript?.id) {
      setSelectedManuscriptId(payload.manuscript.id);
    }
    if (payload.authors?.correspondingAuthor.id) {
      setSelectedAuthorId(payload.authors.correspondingAuthor.id);
    }

    await refreshProjects();
    if (payload.project?.id) {
      await Promise.all([refreshManuscripts(payload.project.id), refreshAuthors(payload.project.id)]);
    }
    if (payload.manuscript?.id) {
      await Promise.all([refreshGraph(payload.manuscript.id), refreshSession(payload.manuscript.id)]);
    }
  }

  async function refreshProjects() {
    const payload = await readJson<{ projects: Project[] }>("/api/projects", { method: "GET" });
    setProjects(payload.projects);
    if (!selectedProjectId && payload.projects[0]) {
      setSelectedProjectId(payload.projects[0].id);
    }
  }

  async function refreshManuscripts(projectId = selectedProjectId) {
    if (!projectId) {
      setManuscripts([]);
      return;
    }

    const payload = await readJson<{ manuscripts: Manuscript[] }>(`/api/manuscripts?projectId=${projectId}`, {
      method: "GET"
    });
    setManuscripts(payload.manuscripts);
    if (!selectedManuscriptId && payload.manuscripts[0]) {
      setSelectedManuscriptId(payload.manuscripts[0].id);
    }
  }

  async function refreshAuthors(projectId = selectedProjectId) {
    if (!projectId) {
      setAuthors([]);
      return;
    }

    const payload = await readJson<{ authors: Author[] }>(`/api/authors?projectId=${projectId}`, {
      method: "GET"
    });
    setAuthors(payload.authors);
    if (!selectedAuthorId && payload.authors[0]) {
      setSelectedAuthorId(payload.authors[0].id);
    }
  }

  async function refreshSession(manuscriptId = selectedManuscriptId) {
    try {
      const url = manuscriptId ? `/api/session?manuscriptId=${manuscriptId}` : "/api/session";
      const payload = await readJson<{ actor: Author; membership: MembershipContext }>(url, { method: "GET" });
      setSession(payload.membership);
    } catch {
      setSession(null);
    }
  }

  async function refreshGraph(manuscriptId = selectedManuscriptId) {
    if (!manuscriptId) {
      setGraph(null);
      setView(null);
      return;
    }

    const [graphPayload, viewPayload] = await Promise.all([
      readJson<GraphPayload>(`/api/manuscripts?manuscriptId=${manuscriptId}`, { method: "GET" }),
      readJson<StructuredView>(`/api/manuscript-view?manuscriptId=${manuscriptId}`, { method: "GET" })
    ]);
    setGraph(graphPayload);
    setView(viewPayload);
  }

  async function refreshEverything() {
    await refreshProjects();
    if (selectedProjectId) {
      await Promise.all([refreshManuscripts(selectedProjectId), refreshAuthors(selectedProjectId)]);
    }
    if (selectedManuscriptId) {
      await Promise.all([refreshGraph(selectedManuscriptId), refreshSession(selectedManuscriptId)]);
    }
  }

  useEffect(() => {
    void refreshEverything();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    void Promise.all([refreshManuscripts(selectedProjectId), refreshAuthors(selectedProjectId)]);
  }, [selectedProjectId]);

  useEffect(() => {
    void Promise.all([refreshGraph(selectedManuscriptId), refreshSession(selectedManuscriptId)]);
  }, [selectedManuscriptId]);

  useEffect(() => {
    const claims = graph?.claims ?? [];
    const evidence = graph?.evidence ?? [];
    const figures = graph?.figures ?? [];
    const methods = graph?.methods ?? [];
    const limitations = graph?.limitations ?? [];

    if (!claims.find((claim) => claim.id === selectedClaimId)) {
      setSelectedClaimId(claims[0]?.id ?? "");
    }

    if (!evidence.find((item) => item.id === selectedEvidenceId)) {
      setSelectedEvidenceId(evidence[0]?.id ?? "");
    }

    if (!figures.find((item) => item.id === selectedFigureId)) {
      setSelectedFigureId(figures[0]?.id ?? "");
    }

    if (!methods.find((item) => item.id === selectedMethodId)) {
      setSelectedMethodId(methods[0]?.id ?? "");
    }

    if (!limitations.find((item) => item.id === selectedLimitationId)) {
      setSelectedLimitationId(limitations[0]?.id ?? "");
    }
  }, [graph, selectedClaimId, selectedEvidenceId, selectedFigureId, selectedMethodId, selectedLimitationId]);

  const approvalSummary = useMemo(() => {
    if (!graph) return [];

    return graph.claims.map((claim) => ({
      claimId: claim.id,
      text: claim.text,
      status: claim.status,
      authorApproved: claim.authorApproved,
      confirmedEvidenceCount: claim.linkedEvidence.filter((link) => link.status === "confirmed").length,
      trust: graph.claimTrustReadiness?.find((item) => item.claimId === claim.id)
    }));
  }, [graph]);

  const currentClaim = graph?.claims.find((claim) => claim.id === selectedClaimId) ?? graph?.claims[0];
  const currentClaimTrust = graph?.claimTrustReadiness?.find((item) => item.claimId === currentClaim?.id);

  const diagnostics = useMemo(() => {
    const canApproveClaim = Boolean(session?.allowedActions?.canApproveClaim);
    const canApproveClaimEvidence = Boolean(session?.allowedActions?.canApproveClaimEvidence);
    const canConfirmFinalIntent = Boolean(session?.allowedActions?.canConfirmFinalIntent);
    const blockerCodes = new Set((currentClaimTrust?.blockers ?? []).map((item) => item.code));

    return {
      missingClaimApproval: currentClaimTrust?.humanApprovalStatus !== "approved_current",
      missingClaimEvidenceConfirmation: blockerCodes.has("missing_confirmed_evidence"),
      missingMethodConfirmation: blockerCodes.has("missing_confirmed_method"),
      missingLimitationConfirmation: blockerCodes.has("missing_required_limitation"),
      missingFinalIntentConfirmation: graph?.manuscriptTrustReadiness?.finalIntentStatus !== "confirmed_current",
      canApproveClaim,
      canApproveClaimEvidence,
      canConfirmFinalIntent,
      claimApprovalReason: canApproveClaim
        ? "Current actor is a manuscript author."
        : "Current actor is not a manuscript author for this manuscript.",
      claimEvidenceReason: canApproveClaimEvidence
        ? "Current actor is a manuscript author."
        : "Current actor is not a manuscript author for this manuscript.",
      finalIntentReason: canConfirmFinalIntent
        ? "Current actor is an owner or corresponding author."
        : "Current actor must be an owner or corresponding author."
    };
  }, [currentClaimTrust, graph?.manuscriptTrustReadiness?.finalIntentStatus, session]);

  const feedbackToneClass = useMemo(() => {
    const value = feedback.toLowerCase();

    if (value.includes("error") || value.includes("failed") || value.includes("blocked") || value.includes("reject")) {
      return "blocking";
    }

    if (value.includes("created") || value.includes("approved") || value.includes("completed") || value.includes("seeded")) {
      return "pill";
    }

    return "muted";
  }, [feedback]);

  const authorLabelById = useMemo(() => {
    const labels = new Map<string, string>();

    for (const author of authors) {
      labels.set(author.id, author.displayName);
    }

    for (const author of graph?.authors ?? []) {
      labels.set(author.id, author.displayName);
    }

    return labels;
  }, [authors, graph?.authors]);

  const sortedApprovals = useMemo(
    () => [...(graph?.approvals ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [graph?.approvals]
  );

  const sortedAuditLogs = useMemo(
    () => [...(graph?.auditLogs ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [graph?.auditLogs]
  );

  const graphCounts = useMemo(
    () => ({
      claims: graph?.claims.length ?? 0,
      evidence: graph?.evidence.length ?? 0,
      figures: graph?.figures.length ?? 0,
      methods: graph?.methods.length ?? 0,
      limitations: graph?.limitations.length ?? 0,
      sections: graph?.sections.length ?? 0,
      approvals: graph?.approvals.length ?? 0,
      reviewResults: graph?.aiReviewResults.length ?? 0
    }),
    [graph]
  );

  const activeBlockers = graph?.manuscriptTrustReadiness?.exportModeEligibility.publicationIntent.blockingReasons ?? [];
  const activeWarnings = graph?.manuscriptTrustReadiness?.exportModeEligibility.publicationIntent.warningReasons ?? [];
  const latestExportBlockers = exportResult?.exportPackage.readinessReport.blockingReasons ?? [];

  return (
    <section>
      <p className="eyebrow">Internal QA</p>
      <h1>Manual Workflow Harness</h1>
      <p className="muted">
        Developer-facing page for manually exercising the current MVP flow on top of the real session, authority, AI
        review, and export APIs.
      </p>
      <p className={feedbackToneClass}>
        {feedback}
      </p>
      <div className="qa-grid">
        <article className="card qa-section">
          <h2>1. Bootstrap</h2>
          <p className="muted">Development-only helpers for seeding, resetting, and replaying the MVP workflow quickly.</p>
          <div className="qa-actions">
            <button
              disabled={loading}
              onClick={() => void withFeedback(async () => runQaHelper("reset"), "QA dataset reset.")}
            >
              Reset QA dataset
            </button>
            <button
              disabled={loading}
              onClick={() => void withFeedback(async () => runQaHelper("seed"), "Demo QA dataset seeded.")}
            >
              Seed demo dataset
            </button>
            <button
              disabled={loading}
              onClick={() =>
                void withFeedback(async () => runQaHelper("bootstrap"), "Bootstrapped demo project, manuscript, author, and session.")
              }
            >
              Bootstrap demo + session
            </button>
          </div>

          <hr />

          <label>
            Project name
            <input
              value={projectForm.name}
              onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
              placeholder="QA Project"
            />
          </label>
          <label>
            Description
            <input
              value={projectForm.description}
              onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
              placeholder="Internal manual QA run"
            />
          </label>
          <button
            disabled={loading || !projectForm.name.trim()}
            onClick={() =>
              void withFeedback(async () => {
                await readJson("/api/projects", {
                  method: "POST",
                  body: JSON.stringify(projectForm)
                });
                setProjectForm({ name: "", description: "" });
                await refreshProjects();
              }, "Project created.")
            }
          >
            Create project
          </button>

          <hr />

          <label>
            Project
            <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Manuscript title
            <input
              value={manuscriptForm.title}
              onChange={(event) => setManuscriptForm({ ...manuscriptForm, title: event.target.value })}
              placeholder="Structured QA Manuscript"
            />
          </label>
          <label>
            Abstract
            <textarea
              value={manuscriptForm.abstract}
              onChange={(event) => setManuscriptForm({ ...manuscriptForm, abstract: event.target.value })}
              rows={4}
            />
          </label>
          <label>
            Keywords
            <input
              value={manuscriptForm.keywords}
              onChange={(event) => setManuscriptForm({ ...manuscriptForm, keywords: event.target.value })}
              placeholder="qa, manual test"
            />
          </label>
          <button
            disabled={loading || !selectedProjectId || !manuscriptForm.title.trim()}
            onClick={() =>
              void withFeedback(async () => {
                await readJson("/api/manuscripts", {
                  method: "POST",
                  body: JSON.stringify({
                    projectId: selectedProjectId,
                    title: manuscriptForm.title,
                    abstract: manuscriptForm.abstract,
                    keywords: manuscriptForm.keywords
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                  })
                });
                setManuscriptForm({ title: "", abstract: "", keywords: "qa, manual test" });
                await refreshManuscripts(selectedProjectId);
              }, "Manuscript created.")
            }
          >
            Create manuscript
          </button>

          <label>
            Current manuscript
            <select value={selectedManuscriptId} onChange={(event) => setSelectedManuscriptId(event.target.value)}>
              <option value="">Select manuscript</option>
              {manuscripts.map((manuscript) => (
                <option key={manuscript.id} value={manuscript.id}>
                  {manuscript.title}
                </option>
              ))}
            </select>
          </label>

          <hr />

          <label>
            Author name
            <input
              value={authorForm.displayName}
              onChange={(event) => setAuthorForm({ ...authorForm, displayName: event.target.value })}
              placeholder="Dr. QA Author"
            />
          </label>
          <label>
            Email
            <input
              value={authorForm.email}
              onChange={(event) => setAuthorForm({ ...authorForm, email: event.target.value })}
              placeholder="qa.author@example.org"
            />
          </label>
          <label>
            ORCID
            <input
              value={authorForm.orcid}
              onChange={(event) => setAuthorForm({ ...authorForm, orcid: event.target.value })}
              placeholder="0000-0000-0000-0000"
            />
          </label>
          <label>
            Manuscript role
            <select
              value={authorForm.memberRole}
              onChange={(event) => setAuthorForm({ ...authorForm, memberRole: event.target.value })}
            >
              <option value="owner">owner</option>
              <option value="corresponding_author">corresponding_author</option>
              <option value="coauthor">coauthor</option>
            </select>
          </label>
          <button
            disabled={loading || !selectedProjectId || !selectedManuscriptId || !authorForm.displayName.trim()}
            onClick={() =>
              void withFeedback(async () => {
                await readJson("/api/authors", {
                  method: "POST",
                  body: JSON.stringify({
                    projectId: selectedProjectId,
                    manuscriptId: selectedManuscriptId,
                    displayName: authorForm.displayName,
                    email: authorForm.email || undefined,
                    orcid: authorForm.orcid || undefined,
                    memberRole: authorForm.memberRole
                  })
                });
                setAuthorForm({ displayName: "", email: "", orcid: "", memberRole: "coauthor" });
                await refreshAuthors(selectedProjectId);
                await refreshGraph(selectedManuscriptId);
              }, "Author created and attached to manuscript.")
            }
          >
            Create author
          </button>
        </article>

        <article className="card qa-section">
          <h2>2. Session and Authority</h2>
          <label>
            Existing author
            <select value={selectedAuthorId} onChange={(event) => setSelectedAuthorId(event.target.value)}>
              <option value="">Select author</option>
              {authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="qa-actions">
            <button
              disabled={loading || !selectedAuthorId}
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/session", {
                    method: "POST",
                    body: JSON.stringify({ authorId: selectedAuthorId, label: "qa-browser-session" })
                  });
                  await refreshSession(selectedManuscriptId);
                }, "Development session created.")
              }
            >
              Create development session
            </button>
            <button
              disabled={loading}
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/session", { method: "DELETE", body: JSON.stringify({}) });
                  await refreshSession(selectedManuscriptId);
                }, "Session cleared.")
              }
            >
              Clear session
            </button>
          </div>

          <p>
            <strong>Current actor:</strong> {session?.actor.displayName ?? "No active session"}
          </p>
          <p>
            <strong>Current manuscript:</strong> {graph?.manuscript.title ?? "none"} {graph?.manuscript.id ? `(${graph.manuscript.id})` : ""}
          </p>
          <p>
            <strong>Project role:</strong> {session?.projectRole ?? "none"}
          </p>
          <p>
            <strong>Manuscript role:</strong> {session?.manuscriptRole ?? "none"}
          </p>
          <div className="qa-actions">
            {authors.map((author) => {
              const manuscriptRole =
                graph?.manuscriptMembers?.find((member) => member.authorId === author.id)?.role ?? "no manuscript role";
              return (
                <button
                  key={author.id}
                  disabled={loading}
                  onClick={() =>
                    void withFeedback(async () => {
                      await readJson("/api/session", {
                        method: "POST",
                        body: JSON.stringify({ authorId: author.id, label: `qa-switch-${author.id}` })
                      });
                      setSelectedAuthorId(author.id);
                      await refreshSession(selectedManuscriptId);
                    }, `Switched session to ${author.displayName}.`)
                  }
                >
                  Switch to {author.displayName} ({manuscriptRole})
                </button>
              );
            })}
          </div>
          <p className="muted">
            Approval-critical actions ignore any client `actorId` and use the resolved server session instead.
          </p>

          <hr />

          <h3>Allowed vs disallowed actions</h3>
          <div className="qa-list-item">
            <p className={diagnostics.canApproveClaim ? "pill" : "blocking"}>
              Claim approval: {diagnostics.canApproveClaim ? "allowed" : "disallowed"}
            </p>
            <p className="muted">{diagnostics.claimApprovalReason}</p>
          </div>
          <div className="qa-list-item">
            <p className={diagnostics.canApproveClaimEvidence ? "pill" : "blocking"}>
              Claim-evidence approval: {diagnostics.canApproveClaimEvidence ? "allowed" : "disallowed"}
            </p>
            <p className="muted">{diagnostics.claimEvidenceReason}</p>
          </div>
          <div className="qa-list-item">
            <p className={diagnostics.canConfirmFinalIntent ? "pill" : "blocking"}>
              Final intent confirmation: {diagnostics.canConfirmFinalIntent ? "allowed" : "disallowed"}
            </p>
            <p className="muted">{diagnostics.finalIntentReason}</p>
          </div>

          <hr />

          <button disabled={loading || !selectedManuscriptId} onClick={() => void withFeedback(refreshEverything, "State refreshed.")}>
            Refresh QA state
          </button>
        </article>

        <article className="card qa-section">
          <h2>3. MVP Object Flow</h2>
          <h3>Working selection</h3>
          <p className="muted">All creation, approval, and section-assembly actions use these selected objects.</p>
          <label>
            Active claim
            <select value={selectedClaimId} onChange={(event) => setSelectedClaimId(event.target.value)}>
              <option value="">Select claim</option>
              {(graph?.claims ?? []).map((claim) => (
                <option key={claim.id} value={claim.id}>
                  {claim.id} | {claim.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Active evidence
            <select value={selectedEvidenceId} onChange={(event) => setSelectedEvidenceId(event.target.value)}>
              <option value="">Select evidence</option>
              {(graph?.evidence ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} | {item.evidenceType}
                </option>
              ))}
            </select>
          </label>
          <label>
            Active figure
            <select value={selectedFigureId} onChange={(event) => setSelectedFigureId(event.target.value)}>
              <option value="">Select figure</option>
              {(graph?.figures ?? []).map((figure) => (
                <option key={figure.id} value={figure.id}>
                  {figure.id} | {figure.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Active method
            <select value={selectedMethodId} onChange={(event) => setSelectedMethodId(event.target.value)}>
              <option value="">Select method</option>
              {(graph?.methods ?? []).map((method) => (
                <option key={method.id} value={method.id}>
                  {method.id} | {method.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Active limitation
            <select value={selectedLimitationId} onChange={(event) => setSelectedLimitationId(event.target.value)}>
              <option value="">Select limitation</option>
              {(graph?.limitations ?? []).map((limitation) => (
                <option key={limitation.id} value={limitation.id}>
                  {limitation.id}
                </option>
              ))}
            </select>
          </label>

          <hr />

          <label>
            Claim text
            <textarea
              value={claimForm.text}
              onChange={(event) => setClaimForm({ ...claimForm, text: event.target.value })}
              rows={3}
            />
          </label>
          <p className="muted">
            Claim type and strength are judged by AI from the saved claim wording and stored as claim framing.
          </p>
          <button
            disabled={loading || !selectedManuscriptId || !claimForm.text.trim()}
            onClick={() =>
              void withFeedback(async () => {
                const payload = await readJson<{ claim: Claim }>("/api/claims", {
                  method: "POST",
                  body: JSON.stringify({
                    manuscriptId: selectedManuscriptId,
                    text: claimForm.text
                  })
                });
                setSelectedClaimId(payload.claim.id);
                setClaimForm({ text: "" });
                await refreshGraph(selectedManuscriptId);
              }, "Claim created.")
            }
          >
            Create claim
          </button>

          <hr />

          <label>
            Evidence summary
            <textarea
              value={evidenceForm.summary}
              onChange={(event) => setEvidenceForm({ ...evidenceForm, summary: event.target.value })}
              rows={3}
            />
          </label>
          <label>
            Confidence notes
            <input
              value={evidenceForm.confidenceNotes}
              onChange={(event) => setEvidenceForm({ ...evidenceForm, confidenceNotes: event.target.value })}
            />
          </label>
          <button
            disabled={loading || !selectedManuscriptId || !selectedClaimId || !evidenceForm.summary.trim()}
            onClick={() =>
              void withFeedback(async () => {
                const payload = await readJson<{ evidence: Evidence }>("/api/evidence", {
                  method: "POST",
                  body: JSON.stringify({
                    manuscriptId: selectedManuscriptId,
                    evidenceType: evidenceForm.evidenceType,
                    summary: evidenceForm.summary,
                    linkedClaimIds: [selectedClaimId],
                    confidenceNotes: evidenceForm.confidenceNotes || undefined,
                    createdBy: session?.actor.id
                  })
                });
                setSelectedEvidenceId(payload.evidence.id);
                setEvidenceForm({ evidenceType: "figure", summary: "", confidenceNotes: "" });
                await refreshGraph(selectedManuscriptId);
              }, `Evidence created and linked to claim ${selectedClaimId}.`)
            }
          >
            Create evidence linked to selected claim
          </button>

          <hr />

          <label>
            Figure title
            <input
              value={figureForm.title}
              onChange={(event) => setFigureForm({ ...figureForm, title: event.target.value })}
            />
          </label>
          <label>
            Figure caption
            <textarea
              value={figureForm.caption}
              onChange={(event) => setFigureForm({ ...figureForm, caption: event.target.value })}
              rows={3}
            />
          </label>
          <button
            disabled={loading || !selectedManuscriptId || !selectedClaimId || !figureForm.title.trim()}
            onClick={() =>
              void withFeedback(async () => {
                const payload = await readJson<{ figure: Figure }>("/api/figures", {
                  method: "POST",
                  body: JSON.stringify({
                    manuscriptId: selectedManuscriptId,
                    figureNumber: figureForm.figureNumber,
                    title: figureForm.title,
                    caption: figureForm.caption,
                    linkedClaimIds: [selectedClaimId],
                    linkedEvidenceIds: selectedEvidenceId ? [selectedEvidenceId] : [],
                    createdBy: session?.actor.id
                  })
                });
                setSelectedFigureId(payload.figure.id);
                setFigureForm({ figureNumber: "1", title: "", caption: "" });
                await refreshGraph(selectedManuscriptId);
              }, "Figure created.")
            }
          >
            Create figure
          </button>

          <hr />

          <label>
            Method title
            <input value={methodForm.title} onChange={(event) => setMethodForm({ ...methodForm, title: event.target.value })} />
          </label>
          <label>
            Method content
            <textarea
              value={methodForm.content}
              onChange={(event) => setMethodForm({ ...methodForm, content: event.target.value })}
              rows={4}
            />
          </label>
          <button
            disabled={loading || !selectedManuscriptId || !selectedClaimId || !methodForm.title.trim()}
            onClick={() =>
              void withFeedback(async () => {
                const payload = await readJson<{ methodBlock: MethodBlock }>("/api/methods", {
                  method: "POST",
                  body: JSON.stringify({
                    manuscriptId: selectedManuscriptId,
                    title: methodForm.title,
                    content: methodForm.content,
                    linkedClaimIds: [selectedClaimId],
                    linkedFigureIds: selectedFigureId ? [selectedFigureId] : [],
                    createdBy: session?.actor.id
                  })
                });
                setSelectedMethodId(payload.methodBlock.id);
                setMethodForm({ title: "", content: "" });
                await refreshGraph(selectedManuscriptId);
              }, "Method block created as proposed support. Approve the claim-method link before checking publication readiness.")
            }
          >
            Create method block
          </button>

          <hr />

          <label>
            Limitation text
            <textarea
              value={limitationForm.text}
              onChange={(event) => setLimitationForm({ ...limitationForm, text: event.target.value })}
              rows={3}
            />
          </label>
          <button
            disabled={loading || !selectedManuscriptId || !selectedClaimId || !limitationForm.text.trim()}
            onClick={() =>
              void withFeedback(async () => {
                const payload = await readJson<{ limitation: Limitation }>("/api/limitations", {
                  method: "POST",
                  body: JSON.stringify({
                    manuscriptId: selectedManuscriptId,
                    text: limitationForm.text,
                    linkedClaimIds: [selectedClaimId],
                    severityOrImportance: limitationForm.severityOrImportance,
                    createdBy: session?.actor.id
                  })
                });
                setSelectedLimitationId(payload.limitation.id);
                setLimitationForm({ text: "", severityOrImportance: "moderate" });
                await refreshGraph(selectedManuscriptId);
              }, "Limitation created as proposed support. Approve the claim-limitation link when this claim type requires it.")
            }
          >
            Create limitation
          </button>

          <hr />

          <button
            disabled={loading || !selectedManuscriptId || !selectedClaimId}
            onClick={() =>
              void withFeedback(async () => {
                const objectRefs = [
                  { entityType: "claim", entityId: selectedClaimId, orderIndex: 1 },
                  selectedFigureId ? { entityType: "figure", entityId: selectedFigureId, orderIndex: 2 } : null,
                  selectedMethodId ? { entityType: "method_block", entityId: selectedMethodId, orderIndex: 3 } : null,
                  selectedLimitationId ? { entityType: "limitation", entityId: selectedLimitationId, orderIndex: 4 } : null
                ].filter(Boolean);

                await readJson("/api/sections", {
                  method: "POST",
                  body: JSON.stringify({
                    manuscriptId: selectedManuscriptId,
                    title: "Results",
                    objectRefs
                  })
                });
                await refreshGraph(selectedManuscriptId);
              }, "Results section assembled.")
            }
          >
            Assemble results section
          </button>
        </article>

        <article className="card qa-section">
          <h2>4. Authority Flow</h2>
          <p className="muted">AI review is diagnostic only. Human approval and final intent confirmation remain separate actions.</p>
          <h3>Current blockers</h3>
          <div className="qa-list-item">
            <p className={diagnostics.missingClaimApproval ? "blocking" : "pill"}>
              Claim approval {diagnostics.missingClaimApproval ? "missing" : "satisfied"}
            </p>
            <p className={diagnostics.missingClaimEvidenceConfirmation ? "blocking" : "pill"}>
              Claim-evidence confirmation {diagnostics.missingClaimEvidenceConfirmation ? "missing" : "satisfied"}
            </p>
            <p className={diagnostics.missingMethodConfirmation ? "blocking" : "pill"}>
              Claim-method confirmation {diagnostics.missingMethodConfirmation ? "missing" : "satisfied"}
            </p>
            <p className={diagnostics.missingLimitationConfirmation ? "blocking" : "pill"}>
              Claim-limitation confirmation {diagnostics.missingLimitationConfirmation ? "missing" : "not required or satisfied"}
            </p>
            <p className={diagnostics.missingFinalIntentConfirmation ? "blocking" : "pill"}>
              Final intent confirmation {diagnostics.missingFinalIntentConfirmation ? "missing" : "satisfied"}
            </p>
          </div>
          <div className="qa-list-item">
            <p className={graph?.manuscriptTrustReadiness?.exportModeEligibility.publicationIntent.eligible ? "pill" : "blocking"}>
              Publication-intent export:{" "}
              {graph?.manuscriptTrustReadiness?.exportModeEligibility.publicationIntent.eligible ? "ready" : "blocked"}
            </p>
            <p className="muted">
              {activeBlockers.length > 0
                ? activeBlockers.join(" ")
                : "No active publication-export blockers reported by the server."}
            </p>
          </div>
          <div className="qa-list-item">
            <p>
              <strong>Active targets</strong>
            </p>
            <p className="muted">Claim: {selectedClaimId || "none selected"}</p>
            <p className="muted">Evidence: {selectedEvidenceId || "none selected"}</p>
            <p className="muted">Figure: {selectedFigureId || "none selected"}</p>
            <p className="muted">Method: {selectedMethodId || "none selected"}</p>
            <p className="muted">Limitation: {selectedLimitationId || "none selected"}</p>
          </div>
          {currentClaimTrust ? (
            <div className="qa-list-item">
              <p>
                <strong>Current claim trust contract</strong>
              </p>
              <p className="muted">Lifecycle: {currentClaimTrust.lifecycleState}</p>
              <p className="muted">AI review: {currentClaimTrust.aiReviewStatus}</p>
              <p className="muted">Human approval: {currentClaimTrust.humanApprovalStatus}</p>
              <p className="muted">Final intent status: {currentClaimTrust.finalIntentStatus}</p>
              {currentClaimTrust.blockers.map((item) => (
                <p key={item.code} className="blocking">
                  {item.message}
                </p>
              ))}
              {currentClaimTrust.warnings.map((item) => (
                <p key={item.code} className="warning">
                  {item.message}
                </p>
              ))}
            </div>
          ) : null}

          <h3>AI review</h3>
          <div className="qa-actions">
            <button
              disabled={loading || !selectedManuscriptId}
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/ai-review", {
                    method: "POST",
                    body: JSON.stringify({ manuscriptId: selectedManuscriptId })
                  });
                  await refreshGraph(selectedManuscriptId);
                }, "AI review completed.")
              }
            >
              Run AI review
            </button>
          </div>
          <h3>Human approvals</h3>
          <div className="qa-actions">
            <button
              disabled={loading || !selectedClaimId || !diagnostics.canApproveClaim}
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/approvals", {
                    method: "POST",
                    body: JSON.stringify({
                      approvalType: "claim_approval",
                      targetEntityId: selectedClaimId
                    })
                  });
                  await refreshGraph(selectedManuscriptId);
                }, "Claim approved through resolved session identity.")
              }
            >
              Approve claim
            </button>
            <button
              disabled={loading || !selectedClaimId || !selectedEvidenceId || !diagnostics.canApproveClaimEvidence}
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/approvals", {
                    method: "POST",
                    body: JSON.stringify({
                      approvalType: "claim_evidence_approval",
                      targetEntityId: selectedClaimId,
                      evidenceId: selectedEvidenceId
                    })
                  });
                  await refreshGraph(selectedManuscriptId);
                }, "Claim-evidence link approved.")
              }
            >
              Approve claim-evidence link
            </button>
            <button
              disabled={loading || !selectedClaimId || !selectedMethodId || !diagnostics.canApproveClaimEvidence}
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/approvals", {
                    method: "POST",
                    body: JSON.stringify({
                      approvalType: "claim_method_approval",
                      targetEntityId: selectedClaimId,
                      methodBlockId: selectedMethodId
                    })
                  });
                  await refreshGraph(selectedManuscriptId);
                }, "Claim-method link approved.")
              }
            >
              Approve claim-method link
            </button>
            <button
              disabled={loading || !selectedClaimId || !selectedLimitationId || !diagnostics.canApproveClaimEvidence}
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/approvals", {
                    method: "POST",
                    body: JSON.stringify({
                      approvalType: "claim_limitation_approval",
                      targetEntityId: selectedClaimId,
                      limitationId: selectedLimitationId
                    })
                  });
                  await refreshGraph(selectedManuscriptId);
                }, "Claim-limitation link approved.")
              }
            >
              Approve claim-limitation link
            </button>
            <button
              disabled={
                loading ||
                !selectedClaimId ||
                diagnostics.missingClaimApproval ||
                diagnostics.missingClaimEvidenceConfirmation ||
                diagnostics.missingMethodConfirmation ||
                diagnostics.missingLimitationConfirmation
              }
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/approvals", {
                    method: "POST",
                    body: JSON.stringify({
                      approvalType: "claim_publication_ready",
                      targetEntityId: selectedClaimId
                    })
                  });
                  await refreshGraph(selectedManuscriptId);
                }, "Claim marked publication-ready.")
              }
            >
              Mark claim publication-ready
            </button>
          </div>
          <h3>Final intent and export</h3>
          <div className="qa-actions">
            <button
              disabled={loading || !selectedManuscriptId}
              onClick={() =>
                void withFeedback(async () => {
                  await requestExport(false);
                  await refreshGraph(selectedManuscriptId);
                }, "Export attempted without final intent confirmation.")
              }
            >
              Attempt export
            </button>
            <button
              disabled={loading || !selectedManuscriptId || !diagnostics.canConfirmFinalIntent}
              onClick={() =>
                void withFeedback(async () => {
                  await readJson("/api/approvals", {
                    method: "POST",
                    body: JSON.stringify({
                      approvalType: "pre_export_intent_confirmation",
                      targetEntityId: selectedManuscriptId
                    })
                  });
                  await refreshGraph(selectedManuscriptId);
                }, "Final intent confirmation completed.")
              }
            >
              Complete final intent confirmation
            </button>
            <button
              disabled={loading || !selectedManuscriptId}
              onClick={() =>
                void withFeedback(async () => {
                  await requestExport(true);
                  await refreshGraph(selectedManuscriptId);
                }, "Export attempted with final intent confirmation.")
              }
            >
              Attempt export with final intent confirmation
            </button>
          </div>
        </article>
      </div>

      <div className="qa-grid qa-bottom">
        <article className="card qa-section">
          <h2>5. Read-only Status</h2>
          <h3>Current state snapshot</h3>
          <div className="qa-list-item">
            <p>
              <strong>Current actor:</strong> {session?.actor.displayName ?? "No active session"}
            </p>
            <p>
              <strong>Project role:</strong> {session?.projectRole ?? "none"}
            </p>
            <p>
              <strong>Manuscript role:</strong> {session?.manuscriptRole ?? "none"}
            </p>
            <p>
              <strong>Manuscript:</strong> {graph?.manuscript.title ?? "none"} {graph?.manuscript.id ? `(${graph.manuscript.id})` : ""}
            </p>
          </div>

          <h3>Graph counts</h3>
          <div className="qa-list-item">
            <p>Claims: {graphCounts.claims}</p>
            <p>Evidence: {graphCounts.evidence}</p>
            <p>Figures: {graphCounts.figures}</p>
            <p>Methods: {graphCounts.methods}</p>
            <p>Limitations: {graphCounts.limitations}</p>
            <p>Sections: {graphCounts.sections}</p>
            <p>Approval events: {graphCounts.approvals}</p>
            <p>AI review results: {graphCounts.reviewResults}</p>
          </div>

          <h3>Trust and export readiness</h3>
          <p className={graph?.manuscriptTrustReadiness?.exportModeEligibility.draftInternalShare.eligible ? "pill" : "warning"}>
            Draft/internal export:{" "}
            {graph?.manuscriptTrustReadiness?.exportModeEligibility.draftInternalShare.eligible ? "eligible" : "blocked"}
          </p>
          {(graph?.manuscriptTrustReadiness?.exportModeEligibility.draftInternalShare.blockingReasons ?? []).map((reason) => (
            <p key={`draft-${reason}`} className="blocking">
              {reason}
            </p>
          ))}
          {(graph?.manuscriptTrustReadiness?.exportModeEligibility.draftInternalShare.warningReasons ?? []).map((warning) => (
            <p key={`draft-warning-${warning}`} className="warning">
              {warning}
            </p>
          ))}
          <p className={graph?.manuscriptTrustReadiness?.exportModeEligibility.publicationIntent.eligible ? "pill" : "blocking"}>
            Publication-intent export:{" "}
            {graph?.manuscriptTrustReadiness?.exportModeEligibility.publicationIntent.eligible ? "eligible" : "blocked"}
          </p>
          {activeBlockers.length ? (
            activeBlockers.map((reason) => (
              <p key={reason} className="blocking">
                {reason}
              </p>
            ))
          ) : (
            <p className="muted">No active export blockers.</p>
          )}
          {activeWarnings.map((warning) => (
            <p key={warning} className="warning">
              {warning}
            </p>
          ))}

          <h3>Claims</h3>
          {approvalSummary.length === 0 ? <p className="muted">No claims yet.</p> : null}
          {approvalSummary.map((item) => (
            <div key={item.claimId} className="qa-list-item">
              <p>
                <strong>{item.trust?.lifecycleState ?? item.status}</strong>{" "}
                {item.trust ? `| ${item.trust.humanApprovalStatus}` : item.authorApproved ? "| human-approved" : "| not approved"}
              </p>
              <p>{item.text}</p>
              {(() => {
                const framing = graph?.claimFramingAssessments?.find((assessment) => assessment.claimId === item.claimId);
                return framing ? (
                  <p className="muted">
                    AI framing: {framing.suggestedClaimType} | {framing.suggestedStrengthLevel}
                  </p>
                ) : null;
              })()}
              <p className="muted">Confirmed evidence links: {item.confirmedEvidenceCount}</p>
              {item.trust ? (
                <>
                  <p className="muted">AI review: {item.trust.aiReviewStatus}</p>
                  <p className="muted">
                    Draft export: {item.trust.exportModeEligibility.draftInternalShare.eligible ? "eligible" : "blocked"} |
                    Publication export: {item.trust.exportModeEligibility.publicationIntent.eligible ? "eligible" : "blocked"}
                  </p>
                </>
              ) : null}
            </div>
          ))}

          <h3>Approval events</h3>
          {sortedApprovals.length ? (
            sortedApprovals.map((approval) => (
              <div key={approval.id} className="qa-list-item">
                <p>
                  <strong>{approval.approvalType}</strong> by {authorLabelById.get(approval.actorId) ?? approval.actorId}
                </p>
                <p className="muted">
                  {approval.targetEntityType}: {approval.targetEntityId}
                </p>
                <p className="muted">{new Date(approval.createdAt).toLocaleString()}</p>
              </div>
            ))
          ) : (
            <p className="muted">No approval events yet.</p>
          )}

          <h3>Audit log timeline</h3>
          {sortedAuditLogs.length ? (
            sortedAuditLogs.map((log) => (
              <div key={log.id} className="qa-list-item">
                <p>
                  <strong>{log.action}</strong> by {authorLabelById.get(log.actorId) ?? log.actorId}
                </p>
                <p className="muted">
                  {log.targetEntityType}: {log.targetEntityId}
                </p>
                <p className="muted">
                  Source: {log.sourceClassification} | {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          ) : (
            <p className="muted">No audit events yet.</p>
          )}

          <h3>AI review results</h3>
          {graph?.aiReviewResults.length ? (
            graph.aiReviewResults.map((result) => (
              <div key={result.id} className="qa-list-item">
                <p className={result.severity === "blocking" ? "blocking" : "warning"}>{result.ruleId}</p>
                <p>{result.message}</p>
                <p className="muted">{result.recommendedAction}</p>
              </div>
            ))
          ) : (
            <p className="muted">No AI review results yet.</p>
          )}

          <h3>Last export attempt</h3>
          {exportResult ? (
            <div className="qa-list-item">
              <p>
                <strong>{exportResult.exportPackage.status}</strong>
              </p>
              {latestExportBlockers.map((reason) => (
                <p key={reason} className="blocking">
                  {reason}
                </p>
              ))}
              {(exportResult.exportPackage.readinessReport.warnings ?? []).map((warning) => (
                <p key={warning} className="warning">
                  {warning}
                </p>
              ))}
              {exportResult.renderedText ? <p className="muted">Placeholder render was generated.</p> : null}
            </div>
          ) : (
            <p className="muted">No export attempted yet.</p>
          )}
        </article>

        <article className="card qa-section">
          <h2>6. Structured Manuscript View</h2>
          <p className="muted">
            This is the compiled read-only manuscript view from the structured research object graph.
          </p>
          <pre className="qa-pre">{view?.renderedText ?? "No manuscript view yet. Create a section to render content."}</pre>
          <h3>Object counts</h3>
          <pre className="qa-pre">{JSON.stringify(view?.objectCounts ?? {}, null, 2)}</pre>
          <h3>Graph panel</h3>
          <div className="qa-list-item">
            <p>
              <strong>Claims</strong>
            </p>
            {(graph?.claims ?? []).length ? (
              (graph?.claims ?? []).map((claim) => (
                <div key={claim.id}>
                  {(() => {
                    const trust = graph?.claimTrustReadiness?.find((item) => item.claimId === claim.id);
                    return (
                      <>
                  <p>
                    {claim.id} | {trust?.lifecycleState ?? claim.status} |{" "}
                    {trust?.publicationReadiness.ready ? "publication-ready" : "not publication-ready"}
                  </p>
                  <p className="muted">{claim.text}</p>
                  <p className="muted">
                    Evidence links: {claim.linkedEvidence.map((link) => `${link.evidenceId} (${link.status})`).join(", ") || "none"}
                  </p>
                      </>
                    );
                  })()}
                </div>
              ))
            ) : (
              <p className="muted">No claims in graph.</p>
            )}
          </div>

          <div className="qa-list-item">
            <p>
              <strong>Evidence</strong>
            </p>
            {(graph?.evidence ?? []).length ? (
              (graph?.evidence ?? []).map((item) => (
                <div key={item.id}>
                  <p>
                    {item.id} | {item.evidenceType}
                  </p>
                  <p className="muted">{item.summary}</p>
                  <p className="muted">Linked claims: {item.linkedClaimIds.join(", ") || "none"}</p>
                </div>
              ))
            ) : (
              <p className="muted">No evidence in graph.</p>
            )}
          </div>

          <div className="qa-list-item">
            <p>
              <strong>Figures</strong>
            </p>
            {(graph?.figures ?? []).length ? (
              (graph?.figures ?? []).map((figure) => (
                <div key={figure.id}>
                  <p>
                    {figure.id} | Figure {figure.figureNumber ?? "?"} | {figure.title}
                  </p>
                  <p className="muted">Linked claims: {figure.linkedClaimIds.join(", ") || "none"}</p>
                </div>
              ))
            ) : (
              <p className="muted">No figures in graph.</p>
            )}
          </div>

          <div className="qa-list-item">
            <p>
              <strong>Methods</strong>
            </p>
            {(graph?.methods ?? []).length ? (
              (graph?.methods ?? []).map((method) => (
                <div key={method.id}>
                  <p>
                    {method.id} | {method.title}
                  </p>
                  <p className="muted">Linked claims: {method.linkedClaimIds.join(", ") || "none"}</p>
                </div>
              ))
            ) : (
              <p className="muted">No methods in graph.</p>
            )}
          </div>

          <div className="qa-list-item">
            <p>
              <strong>Limitations</strong>
            </p>
            {(graph?.limitations ?? []).length ? (
              (graph?.limitations ?? []).map((limitation) => (
                <div key={limitation.id}>
                  <p>{limitation.id}</p>
                  <p className="muted">{limitation.text}</p>
                  <p className="muted">Linked claims: {limitation.linkedClaimIds.join(", ") || "none"}</p>
                </div>
              ))
            ) : (
              <p className="muted">No limitations in graph.</p>
            )}
          </div>

          <div className="qa-list-item">
            <p>
              <strong>Sections</strong>
            </p>
            {(graph?.sections ?? []).length ? (
              (graph?.sections ?? []).map((section) => (
                <div key={section.id}>
                  <p>
                    {section.id} | {section.title}
                  </p>
                  <p className="muted">
                    Object refs: {section.objectRefs.map((ref) => `${ref.entityType}:${ref.entityId}`).join(", ") || "none"}
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">No sections in graph.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
