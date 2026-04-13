"use client";

import { useEffect, useMemo, useState } from "react";

type Project = { id: string; name: string; description?: string };
type Manuscript = { id: string; projectId: string; title: string; articleType?: string };
type Claim = {
  id: string;
  text: string;
  claimType: string;
  strengthLevel: string;
  authorApproved: boolean;
  linkedEvidence: Array<{ evidenceId: string; status: string }>;
};
type Evidence = { id: string; summary: string; evidenceType: string; linkedClaimIds: string[] };
type Figure = { id: string; title: string; caption: string; figureNumber?: string; linkedClaimIds: string[] };
type MethodBlock = { id: string; title: string; content: string; linkedClaimIds: string[] };
type Limitation = { id: string; text: string; severityOrImportance?: string; linkedClaimIds: string[] };
type Citation = { id: string; citationKey: string; title: string; authors: string[]; year?: number; linkedClaimIds: string[] };
type Section = { id: string; title: string; objectRefs: Array<{ entityType: string; entityId: string }> };
type GraphPayload = {
  manuscript: Manuscript & { abstract?: string };
  claims: Claim[];
  evidence: Evidence[];
  figures: Figure[];
  methods: MethodBlock[];
  citations: Citation[];
  limitations: Limitation[];
  sections: Section[];
  claimFramingAssessments?: ClaimFramingAssessment[];
};
type ClaimValidityAssessment = {
  claimId: string;
  overallValidityScore: number;
  scoreBand: string;
  summaryForUser: string;
  stale: boolean;
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
type ClaimTrustReadiness = {
  claimId: string;
  lifecycleState: string;
  humanApprovalStatus: string;
  aiReviewStatus: string;
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
};
type ProjectMemoryClaimAnalysis = {
  claimId: string;
  manuscriptId: string;
  manuscriptTitle: string;
  claimText: string;
  claimType: string;
  strengthLevel: string;
  authorConfirmed: boolean;
  aiSuggested: boolean;
  supportBundle: {
    evidenceIds: string[];
    figureIds: string[];
    methodIds: string[];
    limitationIds: string[];
    citationIds: string[];
    noteIds: string[];
  };
  unresolvedSupportGaps: string[];
  majorConcerns: string[];
  suggestedNextActions: string[];
  validityAssessment?: ClaimValidityAssessment;
  trustReadiness: ClaimTrustReadiness;
};
type ProjectMemorySummary = {
  projectId: string;
  manuscripts: Array<{ id: string; title: string }>;
  claimAnalyses: ProjectMemoryClaimAnalysis[];
  strongestClaims: Array<{ claimId: string; manuscriptId: string; claimText: string; score: number; scoreBand?: string }>;
  weakestClaims: Array<{ claimId: string; manuscriptId: string; claimText: string; score: number; scoreBand?: string }>;
  claimsMissingSupport: Array<{ claimId: string; manuscriptId: string; claimText: string; gaps: string[] }>;
  unresolvedContradictions: Array<{ leftClaimId: string; rightClaimId: string; reason: string }>;
  authorConfirmedClaimIds: string[];
  aiSuggestedClaimIds: string[];
  lastDigestedAt: string;
};
type GroundedDiscussionAnswer = {
  mode: string;
  question: string;
  answer: string;
  sourceMode: string;
  fallbackReason?: string;
  focus: {
    scope: "project" | "claim" | "comparison";
    primaryClaimId?: string;
    comparisonClaimId?: string;
  };
  referencedClaimIds: string[];
  usedMemoryObjectIds: string[];
  groundingNotes: string[];
  suggestedFollowUps: string[];
  groundedContext: {
    claims: Array<{
      claimId: string;
      manuscriptId: string;
      manuscriptTitle: string;
      claimText: string;
      claimType: string;
      strengthLevel: string;
      validityScore?: number;
      validityBand?: string;
      trustLifecycleState: string;
      supportCounts: {
        evidence: number;
        figures: number;
        methods: number;
        limitations: number;
        citations: number;
        notes: number;
      };
      majorConcerns: string[];
      unresolvedSupportGaps: string[];
    }>;
    memorySignals: string[];
    contradictions: Array<{
      leftClaimId: string;
      rightClaimId: string;
      reason: string;
    }>;
  };
};

type DiscussionFocusMode = "project" | "claim" | "comparison";
type DiscussionRequestMode = "auto" | "deterministic" | "llm";
type DiscussionTurn = GroundedDiscussionAnswer & { id: string; createdAt: string };
type ClaimDiscussionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sourceMode?: string;
  fallbackReason?: string;
  createdAt: string;
};
type ClaimDiscussionThread = {
  id: string;
  claimId: string;
  title?: string;
  messages: ClaimDiscussionMessage[];
};

type IntakeKind = "claim" | "figure" | "method" | "limitation" | "citation" | "note";

const suggestedQuestions = [
  "What are the strongest claims?",
  "What are the weakest claims?",
  "Why is this claim only moderate validity?",
  "What support is missing for this claim?",
  "Explain contradictions or tensions in this project.",
  "Compare these claims.",
  "Draft a results paragraph for this claim.",
  "Rewrite this claim more conservatively."
];

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

function objectLabel(kind: IntakeKind) {
  switch (kind) {
    case "claim":
      return "Claim";
    case "figure":
      return "Figure";
    case "method":
      return "Method block";
    case "limitation":
      return "Limitation";
    case "citation":
      return "Reference";
    case "note":
      return "Interpretive note";
  }
}

function claimTitle(text: string) {
  return text.length > 84 ? `${text.slice(0, 81)}...` : text;
}

export default function ResearchStudioClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedManuscriptId, setSelectedManuscriptId] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [comparisonClaimId, setComparisonClaimId] = useState("");
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [memory, setMemory] = useState<ProjectMemorySummary | null>(null);
  const [discussion, setDiscussion] = useState<GroundedDiscussionAnswer | null>(null);
  const [discussionHistory, setDiscussionHistory] = useState<DiscussionTurn[]>([]);
  const [claimDiscussionThread, setClaimDiscussionThread] = useState<ClaimDiscussionThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading research studio...");
  const [discussionFocusMode, setDiscussionFocusMode] = useState<DiscussionFocusMode>("project");
  const [discussionMode, setDiscussionMode] = useState<DiscussionRequestMode>("auto");
  const [intakeKind, setIntakeKind] = useState<IntakeKind>("claim");
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [manuscriptForm, setManuscriptForm] = useState({ title: "", abstract: "" });
  const [claimForm, setClaimForm] = useState({ text: "" });
  const [figureForm, setFigureForm] = useState({ figureNumber: "", title: "", caption: "" });
  const [methodForm, setMethodForm] = useState({ title: "", content: "" });
  const [limitationForm, setLimitationForm] = useState({ text: "", severityOrImportance: "moderate" });
  const [citationForm, setCitationForm] = useState({
    citationKey: "",
    title: "",
    authors: "",
    year: "",
    doi: "",
    url: ""
  });
  const [noteForm, setNoteForm] = useState({ text: "" });
  const [busyState, setBusyState] = useState<null | "project" | "manuscript" | "intake" | "memory" | "discussion">(null);
  const [question, setQuestion] = useState("What are the strongest claims?");

  async function refreshProjects() {
    const payload = await readJson<{ projects: Project[] }>("/api/projects");
    setProjects(payload.projects);
    return payload.projects;
  }

  async function refreshManuscripts(projectId = selectedProjectId) {
    if (!projectId) {
      setManuscripts([]);
      return [];
    }

    const payload = await readJson<{ manuscripts: Manuscript[] }>(`/api/manuscripts?projectId=${projectId}`);
    setManuscripts(payload.manuscripts);
    return payload.manuscripts;
  }

  async function refreshGraph(manuscriptId = selectedManuscriptId) {
    if (!manuscriptId) {
      setGraph(null);
      return;
    }

    const payload = await readJson<GraphPayload>(`/api/manuscripts?manuscriptId=${manuscriptId}`);
    setGraph(payload);
  }

  async function refreshMemory(projectId = selectedProjectId) {
    if (!projectId) {
      setMemory(null);
      return;
    }

    const payload = await readJson<{ memory: ProjectMemorySummary }>(`/api/project-memory?projectId=${projectId}`);
    setMemory(payload.memory);
  }

  async function digestMemory(projectId = selectedProjectId) {
    if (!projectId) return;
    const payload = await readJson<{ memory: ProjectMemorySummary }>("/api/project-memory", {
      method: "POST",
      body: JSON.stringify({ projectId })
    });
    setMemory(payload.memory);
  }

  async function withBusy(
    kind: "project" | "manuscript" | "intake" | "memory" | "discussion",
    action: () => Promise<void>,
    success: string
  ) {
    setBusyState(kind);
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusyState(null);
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const nextProjects = await refreshProjects();
        const nextProjectId = nextProjects[0]?.id ?? "";
        setSelectedProjectId(nextProjectId);

        if (nextProjectId) {
          const nextManuscripts = await refreshManuscripts(nextProjectId);
          const nextManuscriptId = nextManuscripts[0]?.id ?? "";
          setSelectedManuscriptId(nextManuscriptId);

          await Promise.all([refreshMemory(nextProjectId), nextManuscriptId ? refreshGraph(nextManuscriptId) : Promise.resolve()]);
          setMessage("Research studio loaded.");
        } else {
          setMessage("Create a project and a working manuscript to start the intake-memory-discussion flow.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Research studio failed to load.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;

    void (async () => {
      setDiscussion(null);
      setDiscussionHistory([]);
      setClaimDiscussionThread(null);
      const nextManuscripts = await refreshManuscripts(selectedProjectId);
      if (!nextManuscripts.some((item) => item.id === selectedManuscriptId)) {
        setSelectedManuscriptId(nextManuscripts[0]?.id ?? "");
      }
      await refreshMemory(selectedProjectId);
    })();
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedManuscriptId) {
      setGraph(null);
      return;
    }

    void refreshGraph(selectedManuscriptId);
  }, [selectedManuscriptId]);

  useEffect(() => {
    const claimIds = graph?.claims.map((claim) => claim.id) ?? [];
    if (!claimIds.includes(selectedClaimId)) {
      setSelectedClaimId(claimIds[0] ?? "");
    }
    if (comparisonClaimId && !claimIds.includes(comparisonClaimId)) {
      setComparisonClaimId("");
    }
  }, [graph?.claims, selectedClaimId, comparisonClaimId]);

  useEffect(() => {
    if (discussionFocusMode === "claim" && !selectedClaimId) {
      setDiscussionFocusMode("project");
    }

    if (discussionFocusMode === "comparison" && (!selectedClaimId || !comparisonClaimId)) {
      setDiscussionFocusMode(selectedClaimId ? "claim" : "project");
    }
  }, [comparisonClaimId, discussionFocusMode, selectedClaimId]);

  useEffect(() => {
    if (!selectedClaimId) {
      setClaimDiscussionThread(null);
      return;
    }

    void (async () => {
      try {
        const payload = await readJson<{ thread: ClaimDiscussionThread }>(`/api/claim-discussions?claimId=${selectedClaimId}`);
        setClaimDiscussionThread(payload.thread);
      } catch {
        setClaimDiscussionThread(null);
      }
    })();
  }, [selectedClaimId]);

  const currentClaim = useMemo(
    () => graph?.claims.find((claim) => claim.id === selectedClaimId) ?? null,
    [graph?.claims, selectedClaimId]
  );

  const currentClaimAnalysis = useMemo(
    () => memory?.claimAnalyses.find((analysis) => analysis.claimId === selectedClaimId) ?? null,
    [memory?.claimAnalyses, selectedClaimId]
  );

  const currentClaimFraming = useMemo(
    () => graph?.claimFramingAssessments?.find((assessment) => assessment.claimId === selectedClaimId) ?? null,
    [graph?.claimFramingAssessments, selectedClaimId]
  );

  const comparisonClaimAnalysis = useMemo(
    () => memory?.claimAnalyses.find((analysis) => analysis.claimId === comparisonClaimId) ?? null,
    [memory?.claimAnalyses, comparisonClaimId]
  );

  const focusClaimIds = useMemo(() => {
    if (discussionFocusMode === "comparison") {
      return [selectedClaimId, comparisonClaimId].filter(Boolean);
    }

    if (discussionFocusMode === "claim") {
      return [selectedClaimId].filter(Boolean);
    }

    return [];
  }, [comparisonClaimId, discussionFocusMode, selectedClaimId]);

  const intakeInbox = useMemo(() => {
    if (!graph) return [];

    return [
      ...graph.claims.map((claim) => ({ id: claim.id, kind: "claim" as const, title: claimTitle(claim.text), detail: claim.claimType })),
      ...graph.figures.map((figure) => ({ id: figure.id, kind: "figure" as const, title: figure.title, detail: figure.figureNumber ? `Figure ${figure.figureNumber}` : "Figure" })),
      ...graph.methods.map((method) => ({ id: method.id, kind: "method" as const, title: method.title, detail: "Method block" })),
      ...graph.limitations.map((limitation) => ({ id: limitation.id, kind: "limitation" as const, title: claimTitle(limitation.text), detail: "Limitation" })),
      ...graph.citations.map((citation) => ({ id: citation.id, kind: "citation" as const, title: citation.title, detail: citation.citationKey })),
      ...graph.evidence.filter((item) => item.evidenceType === "note").map((note) => ({ id: note.id, kind: "note" as const, title: claimTitle(note.summary), detail: "Interpretive note" }))
    ].slice(0, 18);
  }, [graph]);

  async function submitIntake() {
    if (!selectedManuscriptId) {
      throw new Error("Select a manuscript before adding research objects.");
    }

    if (intakeKind === "claim") {
      await readJson("/api/claims", {
        method: "POST",
        body: JSON.stringify({
          manuscriptId: selectedManuscriptId,
          text: claimForm.text
        })
      });
      setClaimForm({ text: "" });
    }

    if (intakeKind === "figure") {
      await readJson("/api/figures", {
        method: "POST",
        body: JSON.stringify({
          manuscriptId: selectedManuscriptId,
          figureNumber: figureForm.figureNumber || undefined,
          title: figureForm.title,
          caption: figureForm.caption,
          linkedClaimIds: selectedClaimId ? [selectedClaimId] : []
        })
      });
      setFigureForm({ figureNumber: "", title: "", caption: "" });
    }

    if (intakeKind === "method") {
      await readJson("/api/methods", {
        method: "POST",
        body: JSON.stringify({
          manuscriptId: selectedManuscriptId,
          title: methodForm.title,
          content: methodForm.content,
          linkedClaimIds: selectedClaimId ? [selectedClaimId] : []
        })
      });
      setMethodForm({ title: "", content: "" });
    }

    if (intakeKind === "limitation") {
      await readJson("/api/limitations", {
        method: "POST",
        body: JSON.stringify({
          manuscriptId: selectedManuscriptId,
          text: limitationForm.text,
          severityOrImportance: limitationForm.severityOrImportance,
          linkedClaimIds: selectedClaimId ? [selectedClaimId] : []
        })
      });
      setLimitationForm({ text: "", severityOrImportance: "moderate" });
    }

    if (intakeKind === "citation") {
      await readJson("/api/citations", {
        method: "POST",
        body: JSON.stringify({
          manuscriptId: selectedManuscriptId,
          citationKey: citationForm.citationKey,
          title: citationForm.title,
          authors: citationForm.authors.split(",").map((item) => item.trim()).filter(Boolean),
          year: citationForm.year ? Number(citationForm.year) : undefined,
          doi: citationForm.doi || undefined,
          url: citationForm.url || undefined,
          linkedClaimIds: selectedClaimId ? [selectedClaimId] : []
        })
      });
      setCitationForm({ citationKey: "", title: "", authors: "", year: "", doi: "", url: "" });
    }

    if (intakeKind === "note") {
      await readJson("/api/evidence", {
        method: "POST",
        body: JSON.stringify({
          manuscriptId: selectedManuscriptId,
          evidenceType: "note",
          summary: noteForm.text,
          linkedClaimIds: selectedClaimId ? [selectedClaimId] : [],
          confidenceNotes: currentClaim ? `Interpretive note for claim ${currentClaim.id}` : undefined
        })
      });
      setNoteForm({ text: "" });
    }

    await Promise.all([refreshGraph(selectedManuscriptId), digestMemory(selectedProjectId)]);
  }

  async function submitDiscussion(nextQuestion = question) {
    if (discussionFocusMode === "claim" && selectedClaimId) {
      const payload = await readJson<{ thread: ClaimDiscussionThread; answer: GroundedDiscussionAnswer }>("/api/claim-discussions", {
        method: "POST",
        body: JSON.stringify({
          claimId: selectedClaimId,
          question: nextQuestion,
          requestedMode: discussionMode
        })
      });

      setClaimDiscussionThread(payload.thread);
      setDiscussion(payload.answer);
      return;
    }

    const payload = await readJson<{ answer: GroundedDiscussionAnswer }>("/api/discussion", {
      method: "POST",
      body: JSON.stringify({
        projectId: selectedProjectId,
        question: nextQuestion,
        claimIds: focusClaimIds,
        requestedMode: discussionMode
      })
    });

    setDiscussion(payload.answer);
    setDiscussionHistory((current) => [
      {
        ...payload.answer,
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString()
      },
      ...current
    ].slice(0, 8));
  }

  function applyDiscussionTurn(turn: GroundedDiscussionAnswer) {
    setQuestion(turn.question);
    const primaryGroundedClaim = turn.groundedContext.claims[0];
    if (primaryGroundedClaim) {
      setSelectedManuscriptId(primaryGroundedClaim.manuscriptId);
    }
    if (turn.focus.scope === "comparison") {
      setDiscussionFocusMode("comparison");
      setSelectedClaimId(turn.focus.primaryClaimId ?? "");
      setComparisonClaimId(turn.focus.comparisonClaimId ?? "");
    } else if (turn.focus.scope === "claim") {
      setDiscussionFocusMode("claim");
      setSelectedClaimId(turn.focus.primaryClaimId ?? "");
      setComparisonClaimId("");
    } else {
      setDiscussionFocusMode("project");
      setComparisonClaimId("");
    }
    setDiscussion(turn);
  }

  const messageToneClass =
    message.toLowerCase().includes("failed") || message.toLowerCase().includes("error") ? "blocking" : "muted";

  return (
    <section>
      <p className="eyebrow">Research Intake / Memory / Discussion Prototype</p>
      <div className="workspace-header">
        <div>
          <h1>Research Studio</h1>
          <p className="muted">
            Bring research objects into a shared project memory, let the system digest claim support, and discuss the
            paper from grounded memory before full manuscript generation.
          </p>
        </div>
        <div className="workspace-toolbar">
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
          <button
            type="button"
            disabled={busyState === "memory" || !selectedProjectId}
            onClick={() =>
              void withBusy("memory", async () => {
                await digestMemory(selectedProjectId);
              }, "Project memory digested and refreshed.")
            }
          >
            {busyState === "memory" ? "Digesting memory..." : "Digest project memory"}
          </button>
        </div>
      </div>

      <p className={messageToneClass}>{message}</p>

      {!projects.length && !loading ? (
        <article className="card workspace-empty">
          <h2>Start a research project</h2>
          <p className="muted">Create a project and a working manuscript so the studio has a place to remember your research objects.</p>
          <div className="qa-inline">
            <label>
              Project name
              <input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} />
            </label>
            <label>
              Project note
              <input value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} />
            </label>
          </div>
          <button
            type="button"
            disabled={busyState === "project" || !projectForm.name.trim()}
            onClick={() =>
              void withBusy("project", async () => {
                const payload = await readJson<{ project: Project }>("/api/projects", {
                  method: "POST",
                  body: JSON.stringify(projectForm)
                });
                setProjectForm({ name: "", description: "" });
                const nextProjects = await refreshProjects();
                setSelectedProjectId(payload.project.id ?? nextProjects[0]?.id ?? "");
              }, "Project created. Add a working manuscript next.")
            }
          >
            {busyState === "project" ? "Creating project..." : "Create project"}
          </button>
        </article>
      ) : null}

      {selectedProjectId && !manuscripts.length ? (
        <article className="card workspace-empty">
          <h2>Add a working manuscript</h2>
          <p className="muted">The research memory graph is project-scoped, but the current intake prototype still stores objects inside a working manuscript.</p>
          <div className="qa-inline">
            <label>
              Manuscript title
              <input value={manuscriptForm.title} onChange={(event) => setManuscriptForm({ ...manuscriptForm, title: event.target.value })} />
            </label>
            <label>
              Abstract note
              <input value={manuscriptForm.abstract} onChange={(event) => setManuscriptForm({ ...manuscriptForm, abstract: event.target.value })} />
            </label>
          </div>
          <button
            type="button"
            disabled={busyState === "manuscript" || !manuscriptForm.title.trim()}
            onClick={() =>
              void withBusy("manuscript", async () => {
                const payload = await readJson<{ manuscript: Manuscript }>("/api/manuscripts", {
                  method: "POST",
                  body: JSON.stringify({
                    projectId: selectedProjectId,
                    title: manuscriptForm.title,
                    abstract: manuscriptForm.abstract
                  })
                });
                setManuscriptForm({ title: "", abstract: "" });
                await refreshManuscripts(selectedProjectId);
                setSelectedManuscriptId(payload.manuscript.id);
              }, "Working manuscript created.")
            }
          >
            {busyState === "manuscript" ? "Creating manuscript..." : "Create working manuscript"}
          </button>
        </article>
      ) : null}

      <div className="workspace author-workspace research-studio">
        <aside className="card workspace-column workspace-left">
          <h2>Layer 1: Research intake</h2>
          <p className="muted">Add structured research objects quickly, then let the system digest them into shared memory.</p>
          <div className="workspace-subsection workspace-subsection-first">
            <label>
              Add object type
              <select value={intakeKind} onChange={(event) => setIntakeKind(event.target.value as IntakeKind)}>
                <option value="claim">Claim</option>
                <option value="figure">Figure / image</option>
                <option value="method">Method block</option>
                <option value="limitation">Limitation</option>
                <option value="citation">Reference</option>
                <option value="note">Interpretive note</option>
              </select>
            </label>
            <label>
              Link to current claim
              <select value={selectedClaimId} onChange={(event) => setSelectedClaimId(event.target.value)}>
                <option value="">No claim selected</option>
                {(graph?.claims ?? []).map((claim) => (
                  <option key={claim.id} value={claim.id}>
                    {claimTitle(claim.text)}
                  </option>
                ))}
              </select>
            </label>

            {intakeKind === "claim" ? (
              <>
                <label>
                  Claim text
                  <textarea value={claimForm.text} rows={4} onChange={(event) => setClaimForm({ ...claimForm, text: event.target.value })} />
                </label>
                <p className="muted">
                  The system will judge claim type and strength after you save the text, and store that framing with the claim.
                </p>
              </>
            ) : null}

            {intakeKind === "figure" ? (
              <>
                <div className="qa-inline">
                  <label>
                    Figure number
                    <input value={figureForm.figureNumber} onChange={(event) => setFigureForm({ ...figureForm, figureNumber: event.target.value })} />
                  </label>
                  <label>
                    Title
                    <input value={figureForm.title} onChange={(event) => setFigureForm({ ...figureForm, title: event.target.value })} />
                  </label>
                </div>
                <label>
                  Caption / result note
                  <textarea value={figureForm.caption} rows={4} onChange={(event) => setFigureForm({ ...figureForm, caption: event.target.value })} />
                </label>
              </>
            ) : null}

            {intakeKind === "method" ? (
              <>
                <label>
                  Method title
                  <input value={methodForm.title} onChange={(event) => setMethodForm({ ...methodForm, title: event.target.value })} />
                </label>
                <label>
                  Method block
                  <textarea value={methodForm.content} rows={5} onChange={(event) => setMethodForm({ ...methodForm, content: event.target.value })} />
                </label>
              </>
            ) : null}

            {intakeKind === "limitation" ? (
              <>
                <label>
                  Limitation text
                  <textarea value={limitationForm.text} rows={4} onChange={(event) => setLimitationForm({ ...limitationForm, text: event.target.value })} />
                </label>
                <label>
                  Importance
                  <select value={limitationForm.severityOrImportance} onChange={(event) => setLimitationForm({ ...limitationForm, severityOrImportance: event.target.value })}>
                    <option value="low">low</option>
                    <option value="moderate">moderate</option>
                    <option value="high">high</option>
                  </select>
                </label>
              </>
            ) : null}

            {intakeKind === "citation" ? (
              <>
                <div className="qa-inline">
                  <label>
                    Citation key
                    <input value={citationForm.citationKey} onChange={(event) => setCitationForm({ ...citationForm, citationKey: event.target.value })} />
                  </label>
                  <label>
                    Year
                    <input value={citationForm.year} onChange={(event) => setCitationForm({ ...citationForm, year: event.target.value })} />
                  </label>
                </div>
                <label>
                  Title
                  <input value={citationForm.title} onChange={(event) => setCitationForm({ ...citationForm, title: event.target.value })} />
                </label>
                <label>
                  Authors
                  <input value={citationForm.authors} onChange={(event) => setCitationForm({ ...citationForm, authors: event.target.value })} placeholder="Comma-separated authors" />
                </label>
                <div className="qa-inline">
                  <label>
                    DOI
                    <input value={citationForm.doi} onChange={(event) => setCitationForm({ ...citationForm, doi: event.target.value })} />
                  </label>
                  <label>
                    URL
                    <input value={citationForm.url} onChange={(event) => setCitationForm({ ...citationForm, url: event.target.value })} />
                  </label>
                </div>
              </>
            ) : null}

            {intakeKind === "note" ? (
              <label>
                Interpretation note
                <textarea
                  value={noteForm.text}
                  rows={4}
                  onChange={(event) => setNoteForm({ ...noteForm, text: event.target.value })}
                  placeholder="Explain the logic behind the result or why a figure seems to support a claim."
                />
              </label>
            ) : null}

            <button
              type="button"
              disabled={
                busyState === "intake" ||
                !selectedManuscriptId ||
                (intakeKind === "claim" && !claimForm.text.trim()) ||
                (intakeKind === "figure" && (!figureForm.title.trim() || !figureForm.caption.trim())) ||
                (intakeKind === "method" && (!methodForm.title.trim() || !methodForm.content.trim())) ||
                (intakeKind === "limitation" && !limitationForm.text.trim()) ||
                (intakeKind === "citation" &&
                  (!citationForm.citationKey.trim() || !citationForm.title.trim() || !citationForm.authors.trim())) ||
                (intakeKind === "note" && !noteForm.text.trim())
              }
              onClick={() =>
                void withBusy("intake", async () => {
                  await submitIntake();
                }, `${objectLabel(intakeKind)} added to project memory.`)
              }
            >
              {busyState === "intake" ? "Adding to memory..." : `Add ${objectLabel(intakeKind).toLowerCase()}`}
            </button>
          </div>

          <div className="workspace-subsection">
            <h3>Intake inbox</h3>
            {intakeInbox.length ? (
              intakeInbox.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="workspace-object-card">
                  <p>
                    <strong>{objectLabel(item.kind)}</strong> | {item.title}
                  </p>
                  <p className="muted">{item.detail}</p>
                </div>
              ))
            ) : (
              <p className="muted">No intake objects yet for the selected manuscript.</p>
            )}
          </div>
        </aside>

        <article className="card workspace-column workspace-center">
          <h2>Layer 2: Project memory</h2>
          <p className="muted">The system digests claim-centered support bundles into shared project memory across the selected project.</p>

          <div className="workspace-subsection workspace-subsection-first">
            <h3>Memory summary</h3>
            {memory ? (
              <>
                <div className="workspace-inline-status">
                  <span className="pill">{memory.claimAnalyses.length} claims remembered</span>
                  <span className="pill">{memory.authorConfirmedClaimIds.length} author-confirmed</span>
                  <span className={memory.aiSuggestedClaimIds.length ? "warning" : "pill"}>{memory.aiSuggestedClaimIds.length} AI-suggested</span>
                  <span className={memory.unresolvedContradictions.length ? "warning" : "pill"}>
                    {memory.unresolvedContradictions.length} contradiction signal(s)
                  </span>
                </div>
                <p className="muted">Last digested {new Date(memory.lastDigestedAt).toLocaleString()}</p>
                <div className="workspace-object-card">
                  <p>
                    <strong>Strongest claims</strong>
                  </p>
                  {memory.strongestClaims.length ? (
                    memory.strongestClaims.slice(0, 3).map((claim) => (
                      <p key={claim.claimId} className="muted">
                        {claim.scoreBand ?? "unassessed"} {claim.score}: {claimTitle(claim.claimText)}
                      </p>
                    ))
                  ) : (
                    <p className="muted">No claims digested yet.</p>
                  )}
                </div>
                <div className="workspace-object-card">
                  <p>
                    <strong>Weakest claims</strong>
                  </p>
                  {memory.weakestClaims.length ? (
                    memory.weakestClaims.slice(0, 3).map((claim) => (
                      <p key={claim.claimId} className="muted">
                        {claim.scoreBand ?? "unassessed"} {claim.score}: {claimTitle(claim.claimText)}
                      </p>
                    ))
                  ) : (
                    <p className="muted">No weak claims detected yet.</p>
                  )}
                </div>
                <div className="workspace-object-card">
                  <p>
                    <strong>Claims missing support</strong>
                  </p>
                  {memory.claimsMissingSupport.length ? (
                    memory.claimsMissingSupport.slice(0, 3).map((item) => (
                      <p key={item.claimId} className="warning">
                        {claimTitle(item.claimText)} - {item.gaps[0]}
                      </p>
                    ))
                  ) : (
                    <p className="muted">No missing-support signals are active right now.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="muted">Digest project memory to build the first shared claim analysis view.</p>
            )}
          </div>

          <div className="workspace-subsection">
            <h3>Claim analyses</h3>
            {memory?.claimAnalyses.length ? (
              memory.claimAnalyses.map((analysis) => (
                <button
                  key={analysis.claimId}
                  type="button"
                  className={`workspace-claim-button${selectedClaimId === analysis.claimId ? " workspace-claim-button-active" : ""}`}
                  onClick={() => {
                    setSelectedManuscriptId(analysis.manuscriptId);
                    setSelectedClaimId(analysis.claimId);
                    setDiscussionFocusMode("claim");
                    setQuestion("Why is this claim only moderate validity?");
                  }}
                >
                  <strong>{claimTitle(analysis.claimText)}</strong>
                  <span className="workspace-claim-meta">
                    <span className={analysis.validityAssessment ? "pill" : "warning"}>
                      {analysis.validityAssessment
                        ? `${analysis.validityAssessment.scoreBand} ${analysis.validityAssessment.overallValidityScore}`
                        : "validity pending"}
                    </span>
                    <span className={analysis.trustReadiness.blockers.length ? "warning" : "pill"}>
                      {analysis.trustReadiness.lifecycleState.replaceAll("_", " ")}
                    </span>
                    <span className={analysis.authorConfirmed ? "pill" : "warning"}>
                      {analysis.authorConfirmed ? "author-confirmed" : "not author-confirmed"}
                    </span>
                  </span>
                  <p className="muted">
                    Support bundle: {analysis.supportBundle.evidenceIds.length} evidence, {analysis.supportBundle.methodIds.length} methods,{" "}
                    {analysis.supportBundle.limitationIds.length} limitations
                  </p>
                  {analysis.unresolvedSupportGaps.slice(0, 2).map((gap) => (
                    <p key={gap} className="warning">
                      {gap}
                    </p>
                  ))}
                </button>
              ))
            ) : (
              <p className="muted">No claim analyses yet. Add intake objects, then digest project memory.</p>
            )}
          </div>
        </article>

        <aside className="card workspace-column workspace-right">
          <h2>Layer 3: Grounded discussion</h2>
          <p className="muted">Discuss the project from remembered claim context, not from a free-floating chat prompt.</p>

          <div className="workspace-subsection workspace-subsection-first">
            <h3>Discussion focus</h3>
            <div className="workspace-inline-status">
              <button type="button" onClick={() => setDiscussionFocusMode("project")} disabled={discussionFocusMode === "project"}>
                Project-level
              </button>
              <button
                type="button"
                onClick={() => setDiscussionFocusMode("claim")}
                disabled={discussionFocusMode === "claim" || !selectedClaimId}
              >
                Claim-level
              </button>
              <button
                type="button"
                onClick={() => setDiscussionFocusMode("comparison")}
                disabled={discussionFocusMode === "comparison" || !selectedClaimId || !comparisonClaimId}
              >
                Compare claims
              </button>
            </div>
            <label>
              Primary claim
              <select value={selectedClaimId} onChange={(event) => setSelectedClaimId(event.target.value)}>
                <option value="">No claim selected</option>
                {(memory?.claimAnalyses ?? []).map((analysis) => (
                  <option key={analysis.claimId} value={analysis.claimId}>
                    {claimTitle(analysis.claimText)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comparison claim
              <select value={comparisonClaimId} onChange={(event) => setComparisonClaimId(event.target.value)}>
                <option value="">No comparison claim</option>
                {(memory?.claimAnalyses ?? []).filter((analysis) => analysis.claimId !== selectedClaimId).map((analysis) => (
                  <option key={analysis.claimId} value={analysis.claimId}>
                    {claimTitle(analysis.claimText)}
                  </option>
                ))}
              </select>
            </label>
            {discussionFocusMode === "project" ? (
              <div className="workspace-object-card">
                <p>
                  <strong>Current project focus</strong>
                </p>
                <p className="muted">
                  {memory
                    ? `${memory.claimAnalyses.length} claims remembered across ${memory.manuscripts.length} manuscript(s).`
                    : "Digest project memory to enable project-level discussion."}
                </p>
                {memory?.unresolvedContradictions.length ? (
                  <p className="warning">{memory.unresolvedContradictions.length} contradiction signal(s) are available for discussion.</p>
                ) : null}
              </div>
            ) : currentClaimAnalysis ? (
              <div className="workspace-object-card">
                <p>
                  <strong>{discussionFocusMode === "comparison" ? "Primary claim" : "Focused claim"}</strong>
                </p>
                <p>{currentClaimAnalysis.claimText}</p>
                <p className="muted">
                  Validity: {currentClaimAnalysis.validityAssessment?.scoreBand ?? "pending"} | Trust:{" "}
                  {currentClaimAnalysis.trustReadiness.lifecycleState.replaceAll("_", " ")}
                </p>
                {currentClaimFraming ? (
                  <p className="muted">
                    AI framing: {currentClaimFraming.suggestedClaimType} | {currentClaimFraming.suggestedStrengthLevel}
                  </p>
                ) : null}
                <p className="muted">
                  Support: {currentClaimAnalysis.supportBundle.evidenceIds.length} evidence, {currentClaimAnalysis.supportBundle.methodIds.length} methods,{" "}
                  {currentClaimAnalysis.supportBundle.limitationIds.length} limitations
                </p>
              </div>
            ) : (
              <p className="muted">Choose a claim to anchor more specific grounded questions.</p>
            )}
            {discussionFocusMode === "comparison" && comparisonClaimAnalysis ? (
              <div className="workspace-object-card">
                <p>
                  <strong>Comparison claim</strong>
                </p>
                <p>{comparisonClaimAnalysis.claimText}</p>
                <p className="muted">
                  Validity: {comparisonClaimAnalysis.validityAssessment?.scoreBand ?? "pending"} | Trust:{" "}
                  {comparisonClaimAnalysis.trustReadiness.lifecycleState.replaceAll("_", " ")}
                </p>
              </div>
            ) : null}
          </div>

          <div className="workspace-subsection">
            <h3>Ask grounded questions</h3>
            <label>
              Discussion engine
              <select value={discussionMode} onChange={(event) => setDiscussionMode(event.target.value as DiscussionRequestMode)}>
                <option value="auto">auto (use LLM if configured)</option>
                <option value="deterministic">deterministic fallback</option>
                <option value="llm">LLM mode</option>
              </select>
            </label>
            <div className="qa-inline">
              {suggestedQuestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
            <label>
              Question
              <textarea value={question} rows={5} onChange={(event) => setQuestion(event.target.value)} />
            </label>
            <p className="muted">
              {discussionFocusMode === "project"
                ? "This answer will use project-level memory."
                : discussionFocusMode === "comparison"
                  ? "This answer will stay anchored to the selected claim pair."
                  : "This answer will stay anchored to the selected claim."}
            </p>
            <button
              type="button"
              disabled={
                busyState === "discussion" ||
                !selectedProjectId ||
                !question.trim() ||
                (discussionFocusMode === "claim" && !selectedClaimId) ||
                (discussionFocusMode === "comparison" && (!selectedClaimId || !comparisonClaimId))
              }
              onClick={() =>
                void withBusy("discussion", async () => {
                  await submitDiscussion(question);
                }, "Grounded project discussion refreshed.")
              }
            >
              {busyState === "discussion" ? "Discussing from memory..." : "Ask from project memory"}
            </button>
          </div>

          <div className="workspace-subsection">
            <h3>Grounded answer</h3>
            {discussion ? (
              <div className="workspace-object-card">
                <p className="pill">{discussion.mode.replaceAll("_", " ")}</p>
                <p className="muted">
                  Produced by:{" "}
                  <strong>
                    {discussion.sourceMode === "llm_openai_responses_v1" ? "LLM discussion mode" : "deterministic fallback"}
                  </strong>
                </p>
                {discussion.fallbackReason ? <p className="warning">{discussion.fallbackReason}</p> : null}
                <p>{discussion.answer}</p>
                <div className="workspace-inline-status">
                  <span className="pill">focus: {discussion.focus.scope}</span>
                  <span className="pill">{discussion.referencedClaimIds.length} claim reference(s)</span>
                  <span className="pill">{discussion.usedMemoryObjectIds.length} memory object(s)</span>
                </div>
                {discussion.groundingNotes.length ? (
                  <>
                    <p>
                      <strong>Grounding</strong>
                    </p>
                    {discussion.groundingNotes.map((note) => (
                      <p key={note} className="muted">
                        {note}
                      </p>
                    ))}
                  </>
                ) : null}
                {discussion.groundedContext.claims.length ? (
                  <>
                    <p>
                      <strong>Grounded on</strong>
                    </p>
                    {discussion.groundedContext.claims.map((claim) => (
                      <div key={claim.claimId} className="workspace-object-card">
                        <p>
                          <strong>{claimTitle(claim.claimText)}</strong>
                        </p>
                        <p className="muted">
                          {claim.manuscriptTitle} | {claim.validityBand ?? "unassessed"} {claim.validityScore ?? 0} |{" "}
                          {claim.trustLifecycleState.replaceAll("_", " ")}
                        </p>
                        <p className="muted">
                          Support bundle: {claim.supportCounts.evidence} evidence, {claim.supportCounts.figures} figures, {claim.supportCounts.methods} methods,{" "}
                          {claim.supportCounts.limitations} limitations, {claim.supportCounts.citations} citations, {claim.supportCounts.notes} notes
                        </p>
                        {claim.majorConcerns.slice(0, 2).map((concern) => (
                          <p key={concern} className="warning">
                            {concern}
                          </p>
                        ))}
                        {claim.unresolvedSupportGaps.slice(0, 1).map((gap) => (
                          <p key={gap} className="warning">
                            {gap}
                          </p>
                        ))}
                      </div>
                    ))}
                  </>
                ) : null}
                {discussion.groundedContext.memorySignals.length ? (
                  <>
                    <p>
                      <strong>Memory signals</strong>
                    </p>
                    {discussion.groundedContext.memorySignals.map((signal) => (
                      <p key={signal} className="muted">
                        {signal}
                      </p>
                    ))}
                  </>
                ) : null}
                {discussion.groundedContext.contradictions.length ? (
                  <>
                    <p>
                      <strong>Tensions detected</strong>
                    </p>
                    {discussion.groundedContext.contradictions.map((item) => (
                      <p key={`${item.leftClaimId}_${item.rightClaimId}`} className="warning">
                        {item.reason}
                      </p>
                    ))}
                  </>
                ) : null}
                {discussion.suggestedFollowUps.length ? (
                  <>
                    <p>
                      <strong>Suggested next questions</strong>
                    </p>
                    {discussion.suggestedFollowUps.map((item) => (
                      <button
                        key={item}
                        type="button"
                        disabled={busyState === "discussion"}
                        onClick={() => {
                          setQuestion(item);
                          applyDiscussionTurn(discussion);
                          void withBusy("discussion", async () => {
                            await submitDiscussion(item);
                          }, "Grounded follow-up discussion refreshed.");
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            ) : (
              <p className="muted">Ask a question to see a grounded project-memory response.</p>
            )}
          </div>

          {discussionFocusMode === "claim" && selectedClaimId ? (
            <div className="workspace-subsection">
              <h3>Saved claim validity chat</h3>
              {claimDiscussionThread?.messages.length ? (
                claimDiscussionThread.messages.map((message) => (
                  <div key={message.id} className="workspace-object-card">
                    <p>
                      <strong>{message.role === "user" ? "You" : "System"}</strong>
                    </p>
                    <p>{message.content}</p>
                    <p className="muted">
                      {new Date(message.createdAt).toLocaleString()}
                      {message.sourceMode ? ` | ${message.sourceMode}` : ""}
                    </p>
                    {message.fallbackReason ? <p className="warning">{message.fallbackReason}</p> : null}
                  </div>
                ))
              ) : (
                <p className="muted">No saved claim discussion yet. Ask a claim-level validity question to start a persistent thread for this claim.</p>
              )}
            </div>
          ) : null}

          <div className="workspace-subsection">
            <h3>Discussion continuity</h3>
            {discussionHistory.length ? (
              discussionHistory.map((turn) => (
                <button
                  key={turn.id}
                  type="button"
                  className="workspace-claim-button"
                  onClick={() => applyDiscussionTurn(turn)}
                >
                  <strong>{turn.question}</strong>
                  <span className="workspace-claim-meta">
                    <span className="pill">{turn.mode.replaceAll("_", " ")}</span>
                    <span className="pill">{turn.focus.scope}</span>
                  </span>
                  <p className="muted">{new Date(turn.createdAt).toLocaleTimeString()}</p>
                </button>
              ))
            ) : (
              <p className="muted">Your recent grounded questions will stay here so follow-up discussion keeps its claim context.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
