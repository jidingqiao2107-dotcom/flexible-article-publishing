"use client";

import { useEffect, useMemo, useState } from "react";

type Project = { id: string; name: string; description?: string };
type Manuscript = { id: string; projectId: string; title: string; abstract?: string };
type GraphPayload = any;
type ProjectMemorySummary = any;
type ClaimCheckResult = any;
type GroundedDiscussionAnswer = any;
type ClaimDiscussionThread = any;
type BusyState = null | "project" | "manuscript" | "upload" | "claim" | "mapping" | "check" | "memory" | "discussion";
type DiscussionMode = "auto" | "deterministic" | "llm";

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

async function uploadSupport(formData: FormData) {
  const response = await fetch("/api/support-assets", { method: "POST", body: formData });
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };

  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Upload failed with status ${response.status}.`);
  }

  return payload;
}

function claimTitle(text: string) {
  return text.length > 88 ? `${text.slice(0, 85)}...` : text;
}

function supportCategoryLabel(category: "image" | "data" | "text") {
  if (category === "image") return "Figure / image";
  if (category === "data") return "CSV / data";
  return "TXT / text";
}

function nextAction(trust: any, result: any) {
  if (!trust) return "Create or select a claim, then map uploaded evidence to it.";
  if (result?.stale) return "Re-run the claim check because the support bundle changed.";
  if ((trust.blockers?.length ?? 0) > 0) return trust.blockers[0]?.message ?? "Resolve the top blocker.";
  if ((result?.recommendedNextActions?.length ?? 0) > 0) return result.recommendedNextActions[0];
  return "Review the current interpretation and confirm or reject the support links that still look uncertain.";
}

export default function ResearchStudioClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedManuscriptId, setSelectedManuscriptId] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [selectedSupportAssetId, setSelectedSupportAssetId] = useState("");
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [memory, setMemory] = useState<ProjectMemorySummary | null>(null);
  const [claimCheckResult, setClaimCheckResult] = useState<ClaimCheckResult | null>(null);
  const [discussion, setDiscussion] = useState<GroundedDiscussionAnswer | null>(null);
  const [claimDiscussionThread, setClaimDiscussionThread] = useState<ClaimDiscussionThread | null>(null);
  const [busyState, setBusyState] = useState<BusyState>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading claim-check surface...");
  const [discussionMode, setDiscussionMode] = useState<DiscussionMode>("auto");
  const [discussionQuestion, setDiscussionQuestion] = useState("Why does this evidence only moderately support the active claim?");
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [manuscriptForm, setManuscriptForm] = useState({ title: "", abstract: "" });
  const [claimForm, setClaimForm] = useState({ text: "" });
  const [uploadForm, setUploadForm] = useState({ title: "", caption: "", summary: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

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

  async function refreshClaimCheck(claimId = selectedClaimId, manuscriptId = selectedManuscriptId) {
    if (!claimId) {
      setClaimCheckResult(null);
      return;
    }

    const payload = await readJson<{ result: ClaimCheckResult | null }>(`/api/claim-check?claimId=${claimId}&manuscriptId=${manuscriptId}`);
    setClaimCheckResult(payload.result);
  }

  async function refreshClaimDiscussion(claimId = selectedClaimId) {
    if (!claimId) {
      setClaimDiscussionThread(null);
      return;
    }

    try {
      const payload = await readJson<{ thread: ClaimDiscussionThread }>(`/api/claim-discussions?claimId=${claimId}`);
      setClaimDiscussionThread(payload.thread);
    } catch {
      setClaimDiscussionThread(null);
    }
  }

  async function withBusy(kind: BusyState, action: () => Promise<void>, success: string) {
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
        const nextManuscripts = nextProjectId ? await refreshManuscripts(nextProjectId) : [];
        const nextManuscriptId = nextManuscripts[0]?.id ?? "";
        setSelectedManuscriptId(nextManuscriptId);

        if (nextProjectId && nextManuscriptId) {
          await Promise.all([refreshGraph(nextManuscriptId), refreshMemory(nextProjectId)]);
          setMessage("Claim-check surface loaded.");
        } else {
          setMessage("Create a project and manuscript to start evidence-first claim checking.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Claim-check surface failed to load.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;

    void (async () => {
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
    const claimIds = graph?.claims?.map((claim: any) => claim.id) ?? [];
    if (!claimIds.includes(selectedClaimId)) {
      setSelectedClaimId(claimIds[0] ?? "");
    }
  }, [graph?.claims, selectedClaimId]);

  useEffect(() => {
    const assetIds = graph?.supportAssets?.map((asset: any) => asset.id) ?? [];
    if (!assetIds.includes(selectedSupportAssetId)) {
      setSelectedSupportAssetId(assetIds[0] ?? "");
    }
  }, [graph?.supportAssets, selectedSupportAssetId]);

  useEffect(() => {
    if (!selectedClaimId || !selectedManuscriptId) {
      setClaimCheckResult(null);
      setClaimDiscussionThread(null);
      return;
    }

    void Promise.all([refreshClaimCheck(selectedClaimId, selectedManuscriptId), refreshClaimDiscussion(selectedClaimId)]);
  }, [selectedClaimId, selectedManuscriptId]);

  const currentClaim = graph?.claims?.find((claim: any) => claim.id === selectedClaimId) ?? null;
  const currentFraming = graph?.claimFramingAssessments?.find((assessment: any) => assessment.claimId === selectedClaimId) ?? null;
  const currentTrust = graph?.claimTrustReadiness?.find((contract: any) => contract.claimId === selectedClaimId) ?? null;
  const currentAnalysis = memory?.claimAnalyses?.find((analysis: any) => analysis.claimId === selectedClaimId) ?? null;
  const supportAssets = graph?.supportAssets ?? [];

  const mappedSupportAssets = useMemo(() => {
    if (!currentClaim) return [];
    return supportAssets.filter(
      (asset: any) => asset.linkedClaimIds.includes(currentClaim.id) || asset.claimLinks.some((link: any) => link.claimId === currentClaim.id)
    );
  }, [currentClaim, supportAssets]);

  const selectedSupportAsset =
    supportAssets.find((asset: any) => asset.id === selectedSupportAssetId) ?? mappedSupportAssets[0] ?? null;

  if (loading) {
    return (
      <section className="card">
        <p>{message}</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Main product flow</p>
          <h1>Claim Check</h1>
          <p className="muted">Upload evidence first, map it to a claim, run a claim-specific check, and save the result into shared project memory.</p>
        </div>
        <div className="workspace-toolbar">
          <label>
            Project
            <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="workspace-session">
            Manuscript
            <select value={selectedManuscriptId} onChange={(event) => setSelectedManuscriptId(event.target.value)}>
              <option value="">Select a manuscript</option>
              {manuscripts.map((manuscript) => (
                <option key={manuscript.id} value={manuscript.id}>
                  {manuscript.title}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{message}</p>
        </div>
      </div>

      <div className="workspace">
        <aside className="card workspace-column workspace-left">
          <h2>1. Upload evidence</h2>
          <p className="muted">The product starts with figures, CSVs, and TXT support files, not with manuscript controls.</p>

          <div className="workspace-subsection workspace-subsection-first">
            <h3>Quick start</h3>
            <label>
              New project
              <input value={projectForm.name} onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Description
              <textarea rows={3} value={projectForm.description} onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
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
                  await refreshProjects();
                  setSelectedProjectId(payload.project.id);
                }, "Project created.")
              }
            >
              {busyState === "project" ? "Creating project..." : "Create project"}
            </button>
            <label>
              New manuscript
              <input value={manuscriptForm.title} onChange={(event) => setManuscriptForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              Context
              <textarea rows={3} value={manuscriptForm.abstract} onChange={(event) => setManuscriptForm((current) => ({ ...current, abstract: event.target.value }))} />
            </label>
            <button
              type="button"
              disabled={busyState === "manuscript" || !selectedProjectId || !manuscriptForm.title.trim()}
              onClick={() =>
                void withBusy("manuscript", async () => {
                  const payload = await readJson<{ manuscript: Manuscript }>("/api/manuscripts", {
                    method: "POST",
                    body: JSON.stringify({ projectId: selectedProjectId, title: manuscriptForm.title, abstract: manuscriptForm.abstract })
                  });
                  setManuscriptForm({ title: "", abstract: "" });
                  await refreshManuscripts(selectedProjectId);
                  setSelectedManuscriptId(payload.manuscript.id);
                }, "Manuscript created.")
              }
            >
              {busyState === "manuscript" ? "Creating manuscript..." : "Create manuscript"}
            </button>
          </div>

          <div className="workspace-subsection">
            <h3>Upload support file</h3>
            <label>
              File
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.csv,.txt" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
            </label>
            <label>
              Optional title
              <input value={uploadForm.title} onChange={(event) => setUploadForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              Optional caption
              <textarea rows={3} value={uploadForm.caption} onChange={(event) => setUploadForm((current) => ({ ...current, caption: event.target.value }))} />
            </label>
            <label>
              Optional summary
              <textarea rows={3} value={uploadForm.summary} onChange={(event) => setUploadForm((current) => ({ ...current, summary: event.target.value }))} />
            </label>
            <button
              type="button"
              disabled={busyState === "upload" || !selectedManuscriptId || !uploadFile}
              onClick={() =>
                void withBusy("upload", async () => {
                  const formData = new FormData();
                  formData.set("manuscriptId", selectedManuscriptId);
                  formData.set("file", uploadFile!);
                  if (uploadForm.title.trim()) formData.set("title", uploadForm.title);
                  if (uploadForm.caption.trim()) formData.set("caption", uploadForm.caption);
                  if (uploadForm.summary.trim()) formData.set("summary", uploadForm.summary);
                  await uploadSupport(formData);
                  setUploadForm({ title: "", caption: "", summary: "" });
                  setUploadFile(null);
                  await Promise.all([refreshGraph(selectedManuscriptId), refreshMemory(selectedProjectId)]);
                }, "Support uploaded.")
              }
            >
              {busyState === "upload" ? "Uploading..." : "Upload support"}
            </button>
          </div>
          <div className="workspace-subsection">
            <h3>Support library</h3>
            {supportAssets.length ? (
              supportAssets.map((asset: any) => {
                const status = currentClaim ? asset.claimLinks.find((link: any) => link.claimId === currentClaim.id)?.status : undefined;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`workspace-claim-button${selectedSupportAssetId === asset.id ? " workspace-claim-button-active" : ""}`}
                    onClick={() => setSelectedSupportAssetId(asset.id)}
                  >
                    <strong>{asset.originalFilename}</strong>
                    <span className="workspace-claim-meta">
                      <span className="pill">{supportCategoryLabel(asset.supportCategory)}</span>
                      <span className={status === "confirmed" ? "pill" : status === "rejected" ? "warning" : "muted"}>
                        {status ? `current claim: ${status}` : "not linked to current claim"}
                      </span>
                    </span>
                    {asset.publicUrl && asset.supportCategory === "image" ? (
                      <img src={asset.publicUrl} alt={asset.originalFilename} className="workspace-support-preview" />
                    ) : null}
                    {asset.textPreview ? <pre className="qa-pre">{asset.textPreview}</pre> : null}
                    <p className="muted">
                      Linked to {asset.linkedClaimIds.length} claim(s) through {asset.derivedEntityType}.
                    </p>
                  </button>
                );
              })
            ) : (
              <p className="muted">Upload an image, CSV, or TXT file to start the claim-check loop.</p>
            )}
          </div>
        </aside>

        <article className="card workspace-column">
          <h2>2. Claim check</h2>
          <p className="muted">Create or select a claim, map the uploaded evidence bundle, run the check, and correct the interpretation when needed.</p>

          <div className="workspace-subsection workspace-subsection-first">
            <h3>Create claim</h3>
            <label>
              Claim text
              <textarea rows={4} value={claimForm.text} onChange={(event) => setClaimForm({ text: event.target.value })} />
            </label>
            <button
              type="button"
              disabled={busyState === "claim" || !selectedManuscriptId || !claimForm.text.trim()}
              onClick={() =>
                void withBusy("claim", async () => {
                  const payload = await readJson<{ claim: any }>("/api/claims", {
                    method: "POST",
                    body: JSON.stringify({ manuscriptId: selectedManuscriptId, text: claimForm.text })
                  });
                  setClaimForm({ text: "" });
                  await Promise.all([refreshGraph(selectedManuscriptId), refreshMemory(selectedProjectId)]);
                  setSelectedClaimId(payload.claim.id);
                }, "Claim created.")
              }
            >
              {busyState === "claim" ? "Creating claim..." : "Create claim"}
            </button>
          </div>

          <div className="workspace-subsection">
            <h3>Claim list</h3>
            {graph?.claims?.length ? (
              <div className="workspace-claim-list">
                {graph.claims.map((claim: any) => {
                  const trust = graph?.claimTrustReadiness?.find((item: any) => item.claimId === claim.id);
                  const validity = graph?.validityAssessments?.find((item: any) => item.claimId === claim.id);
                  return (
                    <button
                      key={claim.id}
                      type="button"
                      className={`workspace-claim-button${selectedClaimId === claim.id ? " workspace-claim-button-active" : ""}`}
                      onClick={() => setSelectedClaimId(claim.id)}
                    >
                      <strong>{claimTitle(claim.text)}</strong>
                      <span className="workspace-claim-meta">
                        <span className="pill">{claim.claimType}</span>
                        <span className="pill">{claim.strengthLevel}</span>
                        <span className={validity?.stale ? "warning" : "pill"}>
                          {validity ? `${validity.scoreBand} ${validity.overallValidityScore}` : "unchecked"}
                        </span>
                        <span className={trust?.blockers?.length ? "warning" : "pill"}>
                          {trust?.lifecycleState?.replaceAll("_", " ") ?? "draft"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No claims yet. Create one after uploading the first support file.</p>
            )}
          </div>

          <div className="workspace-subsection">
            <h3>Active claim</h3>
            {currentClaim ? (
              <>
                <p className="workspace-claim-text">{currentClaim.text}</p>
                <div className="workspace-inline-status">
                  <span className="pill">AI claim type: {currentFraming?.suggestedClaimType ?? currentClaim.claimType}</span>
                  <span className="pill">AI strength: {currentFraming?.suggestedStrengthLevel ?? currentClaim.strengthLevel}</span>
                  <span className={currentTrust?.stale ? "warning" : "pill"}>
                    {currentTrust?.lifecycleState?.replaceAll("_", " ") ?? "draft"}
                  </span>
                </div>
                {currentFraming ? <p className="muted">{currentFraming.rationale}</p> : null}
                <p className={currentTrust?.blockers?.length ? "warning" : "muted"}>{nextAction(currentTrust, claimCheckResult)}</p>
              </>
            ) : (
              <p className="muted">Select a claim to map the evidence bundle and run the check.</p>
            )}
          </div>

          <div className="workspace-subsection">
            <h3>Map support to the active claim</h3>
            {currentClaim && selectedSupportAsset ? (
              <>
                <div className="workspace-object-card">
                  <p>
                    <strong>{selectedSupportAsset.originalFilename}</strong>
                  </p>
                  <p className="muted">
                    {supportCategoryLabel(selectedSupportAsset.supportCategory)} via {selectedSupportAsset.derivedEntityType}
                  </p>
                  <div className="workspace-inline-status">
                    {["proposed", "confirmed", "rejected"].map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={busyState === "mapping"}
                        onClick={() =>
                          void withBusy("mapping", async () => {
                            await readJson("/api/support-mappings", {
                              method: "POST",
                              body: JSON.stringify({
                                manuscriptId: selectedManuscriptId,
                                supportAssetId: selectedSupportAsset.id,
                                claimId: currentClaim.id,
                                status
                              })
                            });
                            await Promise.all([refreshGraph(selectedManuscriptId), refreshMemory(selectedProjectId), refreshClaimCheck(currentClaim.id, selectedManuscriptId)]);
                          }, `Support link ${status}.`)
                        }
                      >
                        {status === "proposed" ? "Propose link" : status === "confirmed" ? "Confirm support" : "Reject interpretation"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="workspace-object-card">
                  <p>
                    <strong>Linked support for this claim</strong>
                  </p>
                  {mappedSupportAssets.length ? (
                    mappedSupportAssets.map((asset: any) => {
                      const status = asset.claimLinks.find((link: any) => link.claimId === currentClaim.id)?.status;
                      return (
                        <p key={asset.id} className={status === "confirmed" ? "muted" : "warning"}>
                          {asset.originalFilename} - {status ?? "proposed"} via {asset.derivedEntityType}
                        </p>
                      );
                    })
                  ) : (
                    <p className="muted">No support files are linked to this claim yet.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="muted">Choose both a claim and a support file to control the mapping.</p>
            )}
          </div>

          <div className="workspace-subsection">
            <h3>Run claim-specific check</h3>
            <button
              type="button"
              disabled={busyState === "check" || !currentClaim}
              onClick={() =>
                currentClaim &&
                void withBusy("check", async () => {
                  const payload = await readJson<{ result: ClaimCheckResult }>("/api/claim-check", {
                    method: "POST",
                    body: JSON.stringify({ manuscriptId: selectedManuscriptId, claimId: currentClaim.id })
                  });
                  setClaimCheckResult(payload.result);
                  await Promise.all([refreshGraph(selectedManuscriptId), refreshMemory(selectedProjectId)]);
                }, "Claim check completed and stored in shared memory.")
              }
            >
              {busyState === "check" ? "Checking claim..." : "Run claim check"}
            </button>
          </div>

          <div className="workspace-subsection">
            <h3>Claim-check result</h3>
            {claimCheckResult ? (
              <div className="workspace-object-card">
                <div className="workspace-inline-status">
                  <span className="pill">{claimCheckResult.validityAssessment.scoreBand} {claimCheckResult.validityAssessment.overallValidityScore}</span>
                  <span className={claimCheckResult.stale ? "warning" : "pill"}>{claimCheckResult.stale ? "stale" : "current"}</span>
                  <span className={claimCheckResult.overclaimRisk.level === "high" ? "warning" : "pill"}>
                    overclaim risk: {claimCheckResult.overclaimRisk.level}
                  </span>
                </div>
                <p>{claimCheckResult.summaryForUser}</p>
                <p className="muted">
                  <strong>Support strength:</strong> {claimCheckResult.supportStrength.score} - {claimCheckResult.supportStrength.rationale}
                </p>
                {(claimCheckResult.majorConcerns ?? []).map((item: string) => (
                  <p key={item} className="warning">{item}</p>
                ))}
                <p>
                  <strong>Missing support</strong>
                </p>
                {(claimCheckResult.missingSupport ?? []).length ? (
                  claimCheckResult.missingSupport.map((item: string) => <p key={item} className="warning">{item}</p>)
                ) : (
                  <p className="muted">No hard support gap is active in the current check.</p>
                )}
                {claimCheckResult.methodologicalConcern ? <p className="warning"><strong>Method concern:</strong> {claimCheckResult.methodologicalConcern}</p> : null}
                {claimCheckResult.limitationImpact ? <p className="warning"><strong>Limitation impact:</strong> {claimCheckResult.limitationImpact}</p> : null}
                {(claimCheckResult.recommendedNextActions ?? []).map((item: string) => <p key={item} className="muted">{item}</p>)}
                <p>
                  <strong>Evidence references used</strong>
                </p>
                {(claimCheckResult.evidenceReferencesUsed ?? []).map((reference: any) => (
                  <p key={`${reference.objectType}_${reference.objectId}`} className="muted">
                    {reference.objectType}: {reference.label}{reference.originalFilename ? ` (${reference.originalFilename})` : ""}{reference.linkStatus ? ` - ${reference.linkStatus}` : ""}
                  </p>
                ))}
              </div>
            ) : (
              <p className="muted">Run the active claim check to see a structured result here.</p>
            )}
          </div>
        </article>

        <aside className="card workspace-column workspace-right">
          <h2>3. Shared memory</h2>
          <p className="muted">Claim checks update one shared project memory graph so support can be reused across claims and tensions stay visible.</p>

          <div className="workspace-subsection workspace-subsection-first">
            <h3>Memory digest</h3>
            <button
              type="button"
              disabled={busyState === "memory" || !selectedProjectId}
              onClick={() =>
                void withBusy("memory", async () => {
                  const payload = await readJson<{ memory: ProjectMemorySummary }>("/api/project-memory", {
                    method: "POST",
                    body: JSON.stringify({ projectId: selectedProjectId })
                  });
                  setMemory(payload.memory);
                }, "Project memory refreshed.")
              }
            >
              {busyState === "memory" ? "Refreshing memory..." : "Refresh project memory"}
            </button>
            {memory ? (
              <>
                <div className="workspace-inline-status">
                  <span className="pill">{memory.claimAnalyses.length} checked claims</span>
                  <span className={memory.unresolvedContradictions.length ? "warning" : "pill"}>
                    {memory.unresolvedContradictions.length} contradiction signal(s)
                  </span>
                </div>
                <div className="workspace-object-card">
                  <p><strong>Strongest claims</strong></p>
                  {memory.strongestClaims.slice(0, 3).map((claim: any) => <p key={claim.claimId} className="muted">{claim.scoreBand ?? "unchecked"} {claim.score}: {claimTitle(claim.claimText)}</p>)}
                </div>
                <div className="workspace-object-card">
                  <p><strong>Claims missing support</strong></p>
                  {memory.claimsMissingSupport.length ? memory.claimsMissingSupport.slice(0, 4).map((item: any) => <p key={item.claimId} className="warning">{claimTitle(item.claimText)} - {item.gaps[0]}</p>) : <p className="muted">No active missing-support flags right now.</p>}
                </div>
              </>
            ) : (
              <p className="muted">Refresh memory after uploads and claim checks to inspect project-level structure.</p>
            )}
          </div>
          <div className="workspace-subsection">
            <h3>Grounded discussion</h3>
            <label>
              Discussion engine
              <select value={discussionMode} onChange={(event) => setDiscussionMode(event.target.value as DiscussionMode)}>
                <option value="auto">auto</option>
                <option value="deterministic">deterministic</option>
                <option value="llm">llm</option>
              </select>
            </label>
            <label>
              Question
              <textarea rows={4} value={discussionQuestion} onChange={(event) => setDiscussionQuestion(event.target.value)} />
            </label>
            <button
              type="button"
              disabled={busyState === "discussion" || !selectedProjectId || !discussionQuestion.trim()}
              onClick={() =>
                void withBusy("discussion", async () => {
                  if (selectedClaimId) {
                    const payload = await readJson<{ thread: ClaimDiscussionThread; answer: GroundedDiscussionAnswer }>("/api/claim-discussions", {
                      method: "POST",
                      body: JSON.stringify({ claimId: selectedClaimId, question: discussionQuestion, requestedMode: discussionMode })
                    });
                    setClaimDiscussionThread(payload.thread);
                    setDiscussion(payload.answer);
                  } else {
                    const payload = await readJson<{ answer: GroundedDiscussionAnswer }>("/api/discussion", {
                      method: "POST",
                      body: JSON.stringify({ projectId: selectedProjectId, question: discussionQuestion, requestedMode: discussionMode })
                    });
                    setDiscussion(payload.answer);
                  }
                }, "Grounded discussion refreshed.")
              }
            >
              {busyState === "discussion" ? "Discussing..." : "Ask from project memory"}
            </button>
            {discussion ? (
              <div className="workspace-object-card">
                <p className="muted">Produced by {discussion.sourceMode === "llm_openai_responses_v1" ? "LLM mode" : "deterministic mode"}</p>
                {discussion.fallbackReason ? <p className="warning">{discussion.fallbackReason}</p> : null}
                <p>{discussion.answer}</p>
                <div className="workspace-inline-status">
                  <span className="pill">{discussion.mode.replaceAll("_", " ")}</span>
                  <span className="pill">{discussion.usedMemoryObjectIds.length} memory object(s)</span>
                </div>
                {(discussion.groundingNotes ?? []).map((item: string) => <p key={item} className="muted">{item}</p>)}
              </div>
            ) : (
              <p className="muted">Ask why a claim is weak, compare two claim interpretations, or request a conservative rewrite.</p>
            )}
          </div>

          <div className="workspace-subsection">
            <h3>Saved claim notebook</h3>
            {claimDiscussionThread?.messages?.length ? (
              claimDiscussionThread.messages.slice(-6).map((entry: any) => (
                <div key={entry.id} className="workspace-object-card">
                  <p><strong>{entry.role === "user" ? "You" : "System"}</strong></p>
                  <p>{entry.content}</p>
                  <p className="muted">{new Date(entry.createdAt).toLocaleString()}{entry.sourceMode ? ` | ${entry.sourceMode}` : ""}</p>
                </div>
              ))
            ) : (
              <p className="muted">Claim-level discussion is saved here as a persistent notebook for the active claim.</p>
            )}
          </div>

          <div className="workspace-subsection">
            <h3>Current claim memory</h3>
            {currentAnalysis ? (
              <div className="workspace-object-card">
                <p className="muted">
                  Support bundle: {currentAnalysis.supportBundle.supportAssetIds.length} support file(s), {currentAnalysis.supportBundle.evidenceIds.length} evidence object(s), {currentAnalysis.supportBundle.figureIds.length} figure(s)
                </p>
                {(currentAnalysis.majorConcerns ?? []).map((item: string) => <p key={item} className="warning">{item}</p>)}
                {(currentAnalysis.unresolvedSupportGaps ?? []).map((item: string) => <p key={item} className="warning">{item}</p>)}
              </div>
            ) : (
              <p className="muted">Run a claim check to populate shared memory for the active claim.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
