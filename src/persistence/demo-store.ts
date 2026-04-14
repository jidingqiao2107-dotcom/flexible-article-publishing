import { runDeterministicAiReview } from "@/ai-review/rules";
import {
  approveClaim as applyClaimApproval,
  assertCanApproveClaimAuthority,
  assertCanApproveClaimEvidenceAuthority,
  assertCanApproveClaimLimitationAuthority,
  assertCanApproveClaimMethodAuthority,
  assertCanConfirmFinalIntentAuthority,
  createApprovalEvent,
  createAuditLogEntry
} from "@/domain/policies";
import { buildProjectMemorySummary } from "@/domain/project-memory";
import {
  createCurrentClaimTrustSnapshotRef,
  createCurrentManuscriptTrustSnapshotRef,
  getClaimTrustReadiness,
  getManuscriptTrustReadiness
} from "@/domain/trust";
import type {
  AIReviewResult,
  Actor,
  ApprovalEvent,
  Author,
  Citation,
  Claim,
  ClaimDiscussionThread,
  ClaimFramingAssessment,
  ClaimTrustReadiness,
  ClaimValidityAssessment,
  DiscussionRequestedMode,
  EntityLink,
  Evidence,
  ExportMode,
  Figure,
  GroundedDiscussionAnswer,
  LinkStatus,
  Limitation,
  Manuscript,
  ManuscriptInput,
  ManuscriptMember,
  MemberRole,
  MethodBlock,
  Project,
  ProjectMember,
  ProjectMemorySummary,
  ResearchObjectGraph,
  Section,
  SectionObjectRef
} from "@/domain/types";
import { assessClaimValidity as buildClaimValidityAssessment, selectLatestClaimValidityAssessments } from "@/domain/validity";
import { createDocxPlaceholderExport, renderManuscriptText } from "@/export/docx-placeholder";
import { generateClaimFramingAssessment } from "@/llm/claim-framing";
import { generateGroundedDiscussion } from "@/llm/grounded-discussion";

type DemoProjectDirectory = {
  authors: Author[];
  projectMembers: ProjectMember[];
};

type DemoState = {
  projects: Project[];
  graphsByManuscriptId: Record<string, ResearchObjectGraph>;
  projectDirectories: Record<string, DemoProjectDirectory>;
  claimThreads: Record<string, ClaimDiscussionThread>;
  projectMemoryDigests: Record<string, string>;
  defaultActorId: string;
};

const SYSTEM_ACTOR: Actor = { id: "system_route_a", type: "system", displayName: "Route A System" };
const AI_REVIEW_ACTOR: Actor = { id: "ai_first_reviewer", type: "ai", displayName: "AI First Reviewer" };
const DEMO_OWNER_ID = "author_demo_owner";
const DEMO_CORRESPONDING_ID = "author_demo_corresponding";
const DEMO_COAUTHOR_ID = "author_demo_coauthor";
const DEMO_PROJECT_ID = "project_demo_founder";
const DEMO_MANUSCRIPT_ID = "manuscript_demo_founder";

let statePromise: Promise<DemoState> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function simpleHash(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function createClaimTextSnapshotRef(text: string) {
  return `claim_text_${simpleHash(text)}`;
}

function latestFramingAssessments(assessments: ClaimFramingAssessment[] = []) {
  const latest = new Map<string, ClaimFramingAssessment>();

  for (const assessment of [...assessments].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))) {
    if (!latest.has(assessment.claimId)) {
      latest.set(assessment.claimId, assessment);
    }
  }

  return [...latest.values()];
}

function actorFromAuthor(author: Author): Actor {
  return {
    id: author.id,
    type: "human_author",
    displayName: author.displayName
  };
}

function withTrust(graph: ResearchObjectGraph): ResearchObjectGraph {
  const graphWithLatestAssessments: ResearchObjectGraph = {
    ...graph,
    validityAssessments: selectLatestClaimValidityAssessments({
      assessments: graph.validityAssessments ?? [],
      graph
    }),
    claimFramingAssessments: latestFramingAssessments(graph.claimFramingAssessments)
  };

  return {
    ...graphWithLatestAssessments,
    claimTrustReadiness: graphWithLatestAssessments.claims.map((claim) =>
      getClaimTrustReadiness(graphWithLatestAssessments, claim.id)
    )
  };
}

function getProjectDirectory(nextState: DemoState, projectId: string): DemoProjectDirectory {
  const directory = nextState.projectDirectories[projectId];

  if (!directory) {
    throw new Error(`Project ${projectId} was not found in preview mode.`);
  }

  return directory;
}

function getProject(nextState: DemoState, projectId?: string): Project {
  const project = nextState.projects.find((item) => item.id === (projectId ?? nextState.projects[0]?.id));

  if (!project) {
    throw new Error("No preview project is available.");
  }

  return project;
}

function getGraphEntry(nextState: DemoState, manuscriptId?: string) {
  const resolvedManuscriptId = manuscriptId ?? Object.keys(nextState.graphsByManuscriptId)[0];

  if (!resolvedManuscriptId) {
    throw new Error("No preview manuscript is available.");
  }

  const graph = nextState.graphsByManuscriptId[resolvedManuscriptId];

  if (!graph) {
    throw new Error(`Preview manuscript ${resolvedManuscriptId} was not found.`);
  }

  return {
    manuscriptId: resolvedManuscriptId,
    graph
  };
}

function getGraphByClaimId(nextState: DemoState, claimId: string) {
  const entry = Object.entries(nextState.graphsByManuscriptId).find(([, graph]) => graph.claims.some((claim) => claim.id === claimId));

  if (!entry) {
    throw new Error(`Claim ${claimId} was not found in preview mode.`);
  }

  return {
    manuscriptId: entry[0],
    graph: entry[1]
  };
}

function getGraphByEvidenceId(nextState: DemoState, evidenceId: string) {
  const entry = Object.entries(nextState.graphsByManuscriptId).find(([, graph]) =>
    graph.evidence.some((evidence) => evidence.id === evidenceId)
  );

  if (!entry) {
    throw new Error(`Evidence ${evidenceId} was not found in preview mode.`);
  }

  return {
    manuscriptId: entry[0],
    graph: entry[1]
  };
}

function updateEntityLink(collection: EntityLink[], entityId: string, status: LinkStatus) {
  const nextLinks = collection.filter((link) => link.entityId !== entityId);
  nextLinks.push({ entityId, status });
  return nextLinks;
}

function updateClaimFigureLink(claim: Claim, figureId: string, status: LinkStatus) {
  const nextLinks = claim.sourceFigures.filter((link) => link.entityId !== figureId);
  nextLinks.push({ entityId: figureId, status });
  return nextLinks;
}

function hydrateGraph(nextState: DemoState, graph: ResearchObjectGraph): ResearchObjectGraph {
  const directory = getProjectDirectory(nextState, graph.manuscript.projectId);

  return withTrust({
    ...clone(graph),
    authors: clone(directory.authors),
    projectMembers: clone(directory.projectMembers),
    manuscriptMembers: clone(graph.manuscriptMembers ?? [])
  });
}

function pushAuditLog(graph: ResearchObjectGraph, input: Parameters<typeof createAuditLogEntry>[0]) {
  graph.auditLogs = [
    createAuditLogEntry({
      ...input,
      id: createId("audit")
    }),
    ...(graph.auditLogs ?? [])
  ];
}

function findClaim(graph: ResearchObjectGraph, claimId: string) {
  const claim = graph.claims.find((item) => item.id === claimId);

  if (!claim) {
    throw new Error(`Claim ${claimId} was not found.`);
  }

  return claim;
}

function replaceClaim(graph: ResearchObjectGraph, updatedClaim: Claim) {
  graph.claims = graph.claims.map((claim) => (claim.id === updatedClaim.id ? updatedClaim : claim));
}

async function refreshClaimFraming(graph: ResearchObjectGraph, claim: Claim) {
  const assessment = await generateClaimFramingAssessment({
    manuscriptId: graph.manuscript.id,
    claimId: claim.id,
    text: claim.text,
    basedOnSnapshotRef: createClaimTextSnapshotRef(claim.text),
    requestedMode: "auto"
  });

  graph.claimFramingAssessments = [assessment, ...(graph.claimFramingAssessments ?? []).filter((item) => item.claimId !== claim.id)];

  return {
    ...claim,
    claimType: assessment.suggestedClaimType,
    strengthLevel: assessment.suggestedStrengthLevel,
    updatedAt: nowIso()
  };
}

async function seedInitialState(): Promise<DemoState> {
  const createdAt = nowIso();

  const project: Project = {
    id: DEMO_PROJECT_ID,
    type: "project",
    name: "Founder Preview Project",
    description: "Seeded demo data for product review without Docker or Postgres.",
    createdBy: DEMO_OWNER_ID,
    createdAt,
    updatedAt: createdAt
  };

  const manuscript: Manuscript = {
    id: DEMO_MANUSCRIPT_ID,
    type: "manuscript",
    projectId: project.id,
    title: "Grounded Project Memory Demo Manuscript",
    shortTitle: "Grounded Memory Demo",
    abstract: "A seeded preview manuscript that shows intake, memory digestion, discussion, and claim trust flows.",
    keywords: ["preview", "grounded discussion", "structured publishing"],
    articleType: "research_article",
    submissionStatus: "draft",
    metadata: {
      dataAvailability: "Illustrative preview data are included in demo mode.",
      codeAvailability: "Preview-mode code is available in the local repository.",
      aiAssistanceDisclosure: "Deterministic and optional model-backed review are shown separately from approval and readiness."
    },
    createdBy: DEMO_OWNER_ID,
    createdAt,
    updatedAt: createdAt
  };

  const owner: Author = {
    id: DEMO_OWNER_ID,
    type: "author",
    projectId: project.id,
    displayName: "Dr. Owner Preview",
    email: "owner.preview@example.org",
    orcid: "0000-0001-1111-1111"
  };
  const correspondingAuthor: Author = {
    id: DEMO_CORRESPONDING_ID,
    type: "author",
    projectId: project.id,
    displayName: "Dr. Corresponding Preview",
    email: "corresponding.preview@example.org",
    orcid: "0000-0002-2222-2222"
  };
  const coauthor: Author = {
    id: DEMO_COAUTHOR_ID,
    type: "author",
    projectId: project.id,
    displayName: "Dr. Coauthor Preview",
    email: "coauthor.preview@example.org",
    orcid: "0000-0003-3333-3333"
  };

  const projectMembers: ProjectMember[] = [
    { id: createId("project_member"), projectId: project.id, authorId: owner.id, role: "owner", addedBy: owner.id, createdAt },
    {
      id: createId("project_member"),
      projectId: project.id,
      authorId: correspondingAuthor.id,
      role: "coauthor",
      addedBy: owner.id,
      createdAt
    },
    {
      id: createId("project_member"),
      projectId: project.id,
      authorId: coauthor.id,
      role: "coauthor",
      addedBy: owner.id,
      createdAt
    }
  ];

  const manuscriptMembers: ManuscriptMember[] = [
    { id: createId("manuscript_member"), manuscriptId: manuscript.id, authorId: owner.id, role: "owner", addedBy: owner.id, createdAt },
    {
      id: createId("manuscript_member"),
      manuscriptId: manuscript.id,
      authorId: correspondingAuthor.id,
      role: "corresponding_author",
      addedBy: owner.id,
      createdAt
    },
    {
      id: createId("manuscript_member"),
      manuscriptId: manuscript.id,
      authorId: coauthor.id,
      role: "coauthor",
      addedBy: owner.id,
      createdAt
    }
  ];

  const claimOne: Claim = {
    id: "claim_demo_001",
    type: "claim",
    manuscriptId: manuscript.id,
    text: "Treatment A reduced marker B in the primary cohort.",
    claimType: "observation",
    strengthLevel: "moderate",
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
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  const claimTwo: Claim = {
    id: "claim_demo_002",
    type: "claim",
    manuscriptId: manuscript.id,
    text: "Treatment A increased marker B in the resistant subgroup.",
    claimType: "observation",
    strengthLevel: "moderate",
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
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  const evidenceOne: Evidence = {
    id: "evidence_demo_001",
    type: "evidence",
    manuscriptId: manuscript.id,
    evidenceType: "observation",
    summary: "Marker B decreased after Treatment A in the primary cohort figure and assay readout.",
    linkedAssetIds: [],
    linkedClaimIds: [claimOne.id],
    confidenceNotes: "Primary cohort sample size is moderate.",
    provenanceIds: [],
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  const noteOne: Evidence = {
    id: "evidence_demo_002",
    type: "evidence",
    manuscriptId: manuscript.id,
    evidenceType: "note",
    summary: "The resistant subgroup may respond differently because baseline marker B was higher.",
    linkedAssetIds: [],
    linkedClaimIds: [claimTwo.id],
    confidenceNotes: "Interpretive note only; not direct evidence.",
    provenanceIds: [],
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  claimOne.linkedEvidence = [{ evidenceId: evidenceOne.id, status: "confirmed", confirmedBy: correspondingAuthor.id, confirmedAt: createdAt }];
  claimTwo.linkedEvidence = [{ evidenceId: noteOne.id, status: "proposed" }];

  const figureOne: Figure = {
    id: "figure_demo_001",
    type: "figure",
    manuscriptId: manuscript.id,
    figureNumber: "1",
    title: "Primary cohort marker B response",
    caption: "Marker B decreases after Treatment A in the primary cohort.",
    uploadedAssetIds: [],
    rawDataLinkIds: ["dataset_demo_primary"],
    linkedClaimIds: [claimOne.id],
    linkedEvidenceIds: [evidenceOne.id],
    linkedMethodBlockIds: ["method_demo_001"],
    status: "draft",
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  claimOne.sourceFigures = [{ entityId: figureOne.id, status: "confirmed" }];

  const methodOne: MethodBlock = {
    id: "method_demo_001",
    type: "method_block",
    manuscriptId: manuscript.id,
    title: "Marker B quantification",
    content:
      "Marker B was quantified with a pre-specified assay protocol, duplicate measurements, blinded normalization, and cohort-level comparison against matched controls.",
    protocolType: "assay",
    linkedClaimIds: [claimOne.id],
    linkedFigureIds: [figureOne.id],
    reproducibilityNotes: "Protocol and assay controls are captured in the preview supplementary note.",
    status: "draft",
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  claimOne.linkedMethods = [{ entityId: methodOne.id, status: "confirmed" }];

  const limitationOne: Limitation = {
    id: "limitation_demo_001",
    type: "limitation",
    manuscriptId: manuscript.id,
    text: "The primary cohort is modest in size and may not generalize to every resistant subgroup.",
    linkedClaimIds: [claimOne.id],
    severityOrImportance: "moderate",
    status: "draft",
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  claimOne.linkedLimitations = [{ entityId: limitationOne.id, status: "confirmed" }];

  const citationOne: Citation = {
    id: "citation_demo_001",
    type: "citation",
    manuscriptId: manuscript.id,
    citationKey: "Preview2026",
    doi: "10.1000/preview.2026.1",
    title: "Context for marker B response under Treatment A",
    authors: ["Preview, A.", "Memory, B."],
    journal: "Journal of Structured Demos",
    year: 2026,
    linkedClaimIds: [claimOne.id],
    linkedSectionIds: [],
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  claimOne.linkedCitations = [{ entityId: citationOne.id, status: "confirmed" }];

  const sectionOne: Section = {
    id: "section_demo_001",
    type: "section",
    manuscriptId: manuscript.id,
    title: "Results",
    orderIndex: 1,
    objectRefs: [
      { entityType: "claim", entityId: claimOne.id, orderIndex: 1 },
      { entityType: "figure", entityId: figureOne.id, orderIndex: 2 },
      { entityType: "claim", entityId: claimTwo.id, orderIndex: 3 },
      { entityType: "limitation", entityId: limitationOne.id, orderIndex: 4 }
    ],
    status: "draft",
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  const baseGraph: ResearchObjectGraph = {
    manuscript,
    sections: [sectionOne],
    claims: [claimOne, claimTwo],
    evidence: [evidenceOne, noteOne],
    figures: [figureOne],
    methods: [methodOne],
    citations: [citationOne],
    limitations: [limitationOne],
    approvals: [],
    provenance: [],
    auditLogs: [],
    versions: [],
    authors: [owner, correspondingAuthor, coauthor],
    projectMembers,
    manuscriptMembers,
    aiReviewResults: [],
    validityAssessments: [],
    claimFramingAssessments: [],
    datasets: [{ id: "dataset_demo_primary", title: "Primary cohort marker B measurements" }],
    softwareArtifacts: [{ id: "software_demo_notebook", name: "Preview analysis notebook" }]
  };

  for (const claim of baseGraph.claims) {
    const framedClaim = await refreshClaimFraming(baseGraph, claim);
    replaceClaim(baseGraph, framedClaim);
  }

  baseGraph.aiReviewResults = runDeterministicAiReview(baseGraph);
  pushAuditLog(baseGraph, {
    projectId: project.id,
    manuscriptId: manuscript.id,
    actor: AI_REVIEW_ACTOR,
    action: "ai_review.completed",
    targetEntityType: "manuscript",
    targetEntityId: manuscript.id,
    sourceClassification: "ai_suggestion",
    context: { resultCount: baseGraph.aiReviewResults.length }
  });

  for (const claim of baseGraph.claims) {
    const assessment = buildClaimValidityAssessment({
      graph: baseGraph,
      claimId: claim.id,
      assessmentId: createId("validity"),
      now: createdAt
    });
    baseGraph.validityAssessments = [assessment, ...(baseGraph.validityAssessments ?? [])];
  }

  const currentSnapshotRef = createCurrentClaimTrustSnapshotRef(baseGraph, claimOne.id);
  const approvalResult = applyClaimApproval({
    claim: findClaim(baseGraph, claimOne.id),
    actor: actorFromAuthor(correspondingAuthor),
    authority: {
      isManuscriptAuthor: true,
      isProjectOwner: false,
      isCorrespondingAuthor: true
    },
    approvalEventId: createId("approval"),
    notes: "Preview seed approval for founder review."
  });

  replaceClaim(baseGraph, approvalResult.claim);
  baseGraph.approvals = [
    {
      ...approvalResult.approvalEvent,
      targetSnapshotRef: currentSnapshotRef
    }
  ];

  const claimEvidenceApproval = createApprovalEvent({
    id: createId("approval"),
    manuscriptId: manuscript.id,
    approvalType: "claim_evidence_approval",
    actor: actorFromAuthor(correspondingAuthor),
    sourceClassification: "human",
    targetEntityType: "claim_evidence_link",
    targetEntityId: `${claimOne.id}:${evidenceOne.id}`,
    approved: true,
    targetSnapshotRef: currentSnapshotRef,
    notes: "Preview seed evidence confirmation."
  });
  baseGraph.approvals.push(claimEvidenceApproval);

  return {
    projects: [project],
    graphsByManuscriptId: {
      [manuscript.id]: baseGraph
    },
    projectDirectories: {
      [project.id]: {
        authors: [owner, correspondingAuthor, coauthor],
        projectMembers
      }
    },
    claimThreads: {},
    projectMemoryDigests: {
      [project.id]: createdAt
    },
    defaultActorId: correspondingAuthor.id
  };
}

async function getState() {
  if (!statePromise) {
    statePromise = seedInitialState();
  }

  return statePromise;
}

async function updateState<T>(updater: (draft: DemoState) => Promise<T> | T): Promise<T> {
  const current = await getState();
  const draft = clone(current);
  const result = await updater(draft);
  statePromise = Promise.resolve(draft);
  return result;
}

export async function findDemoAuthorById(authorId: string) {
  const nextState = await getState();

  for (const directory of Object.values(nextState.projectDirectories)) {
    const author = directory.authors.find((item) => item.id === authorId);
    if (author) {
      return author;
    }
  }

  return null;
}

export async function getDefaultPreviewActor() {
  const nextState = await getState();
  const author = await findDemoAuthorById(nextState.defaultActorId);

  if (!author) {
    throw new Error("No default preview actor is available.");
  }

  return actorFromAuthor(author);
}

function resolveAuthority(nextState: DemoState, manuscriptId: string, actorId: string) {
  const { graph } = getGraphEntry(nextState, manuscriptId);
  const directory = getProjectDirectory(nextState, graph.manuscript.projectId);
  const author = directory.authors.find((item) => item.id === actorId);

  if (!author) {
    throw new Error(`Author ${actorId} was not found in preview mode.`);
  }

  const manuscriptRole = graph.manuscriptMembers?.find((member) => member.authorId === actorId)?.role ?? null;
  const projectRole = directory.projectMembers.find((member) => member.authorId === actorId)?.role ?? null;

  return {
    actor: actorFromAuthor(author),
    authority: {
      isManuscriptAuthor: Boolean(manuscriptRole),
      isProjectOwner: projectRole === "owner" || manuscriptRole === "owner",
      isCorrespondingAuthor: manuscriptRole === "corresponding_author"
    },
    manuscriptRole,
    projectRole
  };
}
