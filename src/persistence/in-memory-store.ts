import { runDeterministicAiReview } from "@/ai-review/rules";
import { createDocxPlaceholderExport, renderManuscriptText } from "@/export/docx-placeholder";
import { approveClaim, createApprovalEvent, markClaimPublicationReady } from "@/domain/policies";
import { sampleGraph, sampleHumanAuthor, sampleManuscript } from "@/domain/sample-data";
import { attachLimitationToClaim, attachMethodToClaim, createSectionAssembly, linkClaimToEvidence } from "@/domain/graph-operations";
import type {
  ApprovalEvent,
  Author,
  Claim,
  ClaimType,
  Evidence,
  Figure,
  Limitation,
  Manuscript,
  ManuscriptInput,
  MethodBlock,
  Project,
  ResearchObjectGraph,
  Section,
  SectionObjectRef,
  StrengthLevel
} from "@/domain/types";

const now = () => new Date().toISOString();

function inferClaimType(text: string): ClaimType {
  const lowered = text.toLowerCase();
  if (/\bwe hypothesize\b|\bmay\b|\bcould\b|\bmight\b|\bpropose\b/.test(lowered)) return "hypothesis";
  if (/\bmechanism\b|\bpathway\b|\bmediated by\b|\bdriven by\b|\bthrough\b/.test(lowered)) return "mechanism";
  if (/\bsuggests\b|\bindicates\b|\bconsistent with\b|\bimplies\b/.test(lowered)) return "interpretation";
  if (/\bconclude\b|\btherefore\b|\bdemonstrates\b|\bshows that\b/.test(lowered)) return "conclusion";
  if (/\bknown\b|\bpreviously\b|\breported\b|\bin the literature\b/.test(lowered)) return "background";
  return "observation";
}

function inferClaimStrength(text: string): StrengthLevel {
  const lowered = text.toLowerCase();
  if (/\bmay\b|\bcould\b|\bmight\b|\bpreliminary\b|\bexploratory\b/.test(lowered)) return "exploratory";
  if (/\bcauses\b|\bdemonstrates\b|\bestablishes\b|\bproves\b/.test(lowered)) return "strong";
  return "moderate";
}

const projects: Project[] = [
  {
    id: "project_001",
    type: "project",
    name: "Demo Structured Manuscript Project",
    description: "Seed project for Route A authoring workflows.",
    createdBy: sampleHumanAuthor.id,
    createdAt: sampleManuscript.createdAt,
    updatedAt: sampleManuscript.updatedAt
  }
];

let graph: ResearchObjectGraph = sampleGraph;

export function resetDemoGraph(): void {
  graph = sampleGraph;
  projects.splice(1);
}

export function listProjects(): Project[] {
  return projects;
}

export function createProject(input: { name: string; description?: string; createdBy?: string }): Project {
  const project: Project = {
    id: `project_${projects.length + 1}`,
    type: "project",
    name: input.name,
    description: input.description,
    createdBy: input.createdBy ?? sampleHumanAuthor.id,
    createdAt: now(),
    updatedAt: now()
  };

  projects.push(project);
  return project;
}

export function getDemoGraph(): ResearchObjectGraph {
  return graph;
}

export function createManuscript(input: ManuscriptInput): Manuscript {
  const project = projects.find((item) => item.id === input.projectId);

  if (!project) {
    throw new Error(`Project ${input.projectId} was not found.`);
  }

  const timestamp = now();
  const manuscript: Manuscript = {
    id: `manuscript_${Date.now()}`,
    type: "manuscript",
    projectId: project.id,
    title: input.title,
    shortTitle: input.shortTitle,
    abstract: input.abstract,
    keywords: input.keywords ?? [],
    articleType: input.articleType ?? "research_article",
    submissionStatus: "draft",
    metadata: {},
    createdBy: input.createdBy ?? sampleHumanAuthor.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  graph = {
    manuscript,
    sections: [],
    claims: [],
    evidence: [],
    figures: [],
    methods: [],
    citations: [],
    limitations: [],
    approvals: [],
    provenance: [],
    auditLogs: [],
    versions: [],
    authors: [],
    aiReviewResults: [],
    datasets: [],
    softwareArtifacts: []
  };

  return manuscript;
}

export function listClaims(): Claim[] {
  return graph.claims;
}

export function listEvidence(): Evidence[] {
  return graph.evidence;
}

export function listFigures(): Figure[] {
  return graph.figures;
}

export function listMethods(): MethodBlock[] {
  return graph.methods;
}

export function listLimitations(): Limitation[] {
  return graph.limitations;
}

export function listAuthors(): Author[] {
  return graph.authors ?? [];
}

export function listSections(): Section[] {
  return graph.sections;
}

export function createClaim(input: {
  text: string;
  createdBy?: string;
}): Claim {
  const timestamp = now();
  const claim: Claim = {
    id: `claim_${graph.claims.length + 1}`,
    type: "claim",
    manuscriptId: graph.manuscript.id,
    text: input.text,
    claimType: inferClaimType(input.text),
    strengthLevel: inferClaimStrength(input.text),
    status: "draft",
    authorApproved: false,
    publicationReady: false,
    linkedEvidence: [],
    linkedLimitations: [],
    linkedCitations: [],
    linkedMethods: [],
    sourceFigures: [],
    provenanceIds: [],
    reviewFlagIds: [],
    createdBy: input.createdBy ?? sampleHumanAuthor.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  graph = { ...graph, claims: [...graph.claims, claim] };
  return claim;
}

export function createEvidence(input: {
  evidenceType: Evidence["evidenceType"];
  summary: string;
  linkedClaimIds?: string[];
  confidenceNotes?: string;
  createdBy?: string;
}): Evidence {
  const timestamp = now();
  const evidence: Evidence = {
    id: `evidence_${graph.evidence.length + 1}`,
    type: "evidence",
    manuscriptId: graph.manuscript.id,
    evidenceType: input.evidenceType,
    summary: input.summary,
    linkedAssetIds: [],
    linkedClaimIds: input.linkedClaimIds ?? [],
    confidenceNotes: input.confidenceNotes,
    provenanceIds: [],
    createdBy: input.createdBy ?? sampleHumanAuthor.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  graph = { ...graph, evidence: [...graph.evidence, evidence] };

  for (const claimId of input.linkedClaimIds ?? []) {
    graph = linkClaimToEvidence({
      graph,
      claimId,
      evidenceId: evidence.id,
      actor: sampleHumanAuthor,
      confirm: false
    });
  }

  return evidence;
}

export function createFigure(input: {
  title: string;
  caption: string;
  figureNumber?: string;
  linkedClaimIds?: string[];
  linkedEvidenceIds?: string[];
  createdBy?: string;
}): Figure {
  const timestamp = now();
  const figure: Figure = {
    id: `figure_${graph.figures.length + 1}`,
    type: "figure",
    manuscriptId: graph.manuscript.id,
    figureNumber: input.figureNumber,
    title: input.title,
    caption: input.caption,
    uploadedAssetIds: [],
    rawDataLinkIds: [],
    linkedClaimIds: input.linkedClaimIds ?? [],
    linkedEvidenceIds: input.linkedEvidenceIds ?? [],
    linkedMethodBlockIds: [],
    status: "draft",
    createdBy: input.createdBy ?? sampleHumanAuthor.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  graph = {
    ...graph,
    figures: [...graph.figures, figure],
    claims: graph.claims.map((claim) =>
      (input.linkedClaimIds ?? []).includes(claim.id)
        ? {
            ...claim,
            sourceFigures: [
              ...claim.sourceFigures.filter((link) => link.entityId !== figure.id),
              { entityId: figure.id, status: "proposed" }
            ],
            updatedAt: timestamp
          }
        : claim
    )
  };
  return figure;
}

export function createMethodBlock(input: {
  title: string;
  content: string;
  protocolType?: string;
  linkedClaimIds?: string[];
  linkedFigureIds?: string[];
  reproducibilityNotes?: string;
  createdBy?: string;
}): MethodBlock {
  const timestamp = now();
  const method: MethodBlock = {
    id: `method_${graph.methods.length + 1}`,
    type: "method_block",
    manuscriptId: graph.manuscript.id,
    title: input.title,
    content: input.content,
    protocolType: input.protocolType,
    linkedClaimIds: input.linkedClaimIds ?? [],
    linkedFigureIds: input.linkedFigureIds ?? [],
    reproducibilityNotes: input.reproducibilityNotes,
    status: "draft",
    createdBy: input.createdBy ?? sampleHumanAuthor.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  graph = { ...graph, methods: [...graph.methods, method] };

  for (const claimId of input.linkedClaimIds ?? []) {
    graph = attachMethodToClaim({
      graph,
      claimId,
      methodBlockId: method.id,
      actor: sampleHumanAuthor,
      confirm: true
    });
  }

  return method;
}

export function createLimitation(input: {
  text: string;
  scope?: string;
  linkedClaimIds?: string[];
  severityOrImportance?: string;
  createdBy?: string;
}): Limitation {
  const timestamp = now();
  const limitation: Limitation = {
    id: `limitation_${graph.limitations.length + 1}`,
    type: "limitation",
    manuscriptId: graph.manuscript.id,
    text: input.text,
    scope: input.scope,
    linkedClaimIds: input.linkedClaimIds ?? [],
    severityOrImportance: input.severityOrImportance,
    status: "draft",
    createdBy: input.createdBy ?? sampleHumanAuthor.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  graph = { ...graph, limitations: [...graph.limitations, limitation] };

  for (const claimId of input.linkedClaimIds ?? []) {
    graph = attachLimitationToClaim({
      graph,
      claimId,
      limitationId: limitation.id,
      actor: sampleHumanAuthor,
      confirm: true
    });
  }

  return limitation;
}

export function createAuthor(input: { displayName: string; email?: string; orcid?: string }): Author {
  const author: Author = {
    id: `author_${(graph.authors?.length ?? 0) + 1}`,
    type: "author",
    projectId: graph.manuscript.projectId,
    displayName: input.displayName,
    email: input.email,
    orcid: input.orcid
  };

  graph = { ...graph, authors: [...(graph.authors ?? []), author] };
  return author;
}

export function confirmClaimEvidenceLink(input: { claimId: string; evidenceId: string; confirm?: boolean }) {
  graph = linkClaimToEvidence({
    graph,
    claimId: input.claimId,
    evidenceId: input.evidenceId,
    actor: sampleHumanAuthor,
    confirm: input.confirm ?? true
  });

  return graph.claims.find((claim) => claim.id === input.claimId);
}

export function approveClaimEvidenceLink(input: { claimId: string; evidenceId: string; notes?: string }) {
  graph = linkClaimToEvidence({
    graph,
    claimId: input.claimId,
    evidenceId: input.evidenceId,
    actor: sampleHumanAuthor,
    confirm: true
  });

  const approvalEvent = createApprovalEvent({
    id: `approval_${graph.approvals.length + 1}`,
    manuscriptId: graph.manuscript.id,
    approvalType: "claim_evidence_approval",
    actor: sampleHumanAuthor,
    targetEntityType: "claim_evidence_link",
    targetEntityId: `${input.claimId}:${input.evidenceId}`,
    approved: true,
    notes: input.notes ?? "Author confirmed this claim-evidence linkage."
  });

  graph = { ...graph, approvals: [...graph.approvals, approvalEvent] };

  return {
    claim: graph.claims.find((claim) => claim.id === input.claimId),
    approvalEvent
  };
}

export function createSection(input: { title: string; objectRefs: SectionObjectRef[] }): Section {
  const section = createSectionAssembly({
    id: `section_${graph.sections.length + 1}`,
    graph,
    title: input.title,
    objectRefs: input.objectRefs,
    actor: sampleHumanAuthor
  });

  graph = { ...graph, sections: [...graph.sections, section] };
  return section;
}

export function approveDemoClaim(claimId: string): { claim: Claim; approvalEvent: ApprovalEvent } {
  const claim = graph.claims.find((item) => item.id === claimId);

  if (!claim) {
    throw new Error(`Claim ${claimId} was not found.`);
  }

  const result = approveClaim({
    claim,
    actor: sampleHumanAuthor,
    approvalEventId: `approval_${graph.approvals.length + 1}`
  });

  graph = {
    ...graph,
    claims: graph.claims.map((item) => (item.id === claimId ? result.claim : item)),
    approvals: [...graph.approvals, result.approvalEvent]
  };

  return result;
}

export function markDemoClaimPublicationReady(claimId: string): Claim {
  const claim = graph.claims.find((item) => item.id === claimId);

  if (!claim) {
    throw new Error(`Claim ${claimId} was not found.`);
  }

  const publicationReadyClaim = markClaimPublicationReady({
    claim,
    reviewResults: graph.aiReviewResults
  });

  graph = {
    ...graph,
    claims: graph.claims.map((item) => (item.id === claimId ? publicationReadyClaim : item))
  };

  return publicationReadyClaim;
}

export function runReviewForDemoGraph() {
  const reviewResults = runDeterministicAiReview(graph);
  graph = { ...graph, aiReviewResults: reviewResults };
  return reviewResults;
}

export function addFinalIntentApproval(): ApprovalEvent {
  const approval = createApprovalEvent({
    id: `approval_${graph.approvals.length + 1}`,
    manuscriptId: graph.manuscript.id,
    approvalType: "pre_export_intent_confirmation",
    actor: sampleHumanAuthor,
    targetEntityType: "manuscript",
    targetEntityId: graph.manuscript.id,
    approved: true,
    notes: "Author confirmed rendered article intent for placeholder export."
  });

  graph = { ...graph, approvals: [...graph.approvals, approval] };
  return approval;
}

export function createDemoExport(confirmFinalIntent = false) {
  if (confirmFinalIntent) {
    addFinalIntentApproval();
  }

  return createDocxPlaceholderExport({
    id: `export_${Date.now()}`,
    graph,
    createdBy: sampleHumanAuthor.id,
    versionId: "version_demo"
  });
}

export function getStructuredManuscriptView() {
  return {
    manuscript: graph.manuscript,
    sections: graph.sections,
    renderedText: renderManuscriptText(graph),
    objectCounts: {
      claims: graph.claims.length,
      evidence: graph.evidence.length,
      figures: graph.figures.length,
      methods: graph.methods.length,
      limitations: graph.limitations.length
    }
  };
}
