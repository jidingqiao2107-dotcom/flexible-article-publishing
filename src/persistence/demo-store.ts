import { runDeterministicAiReview } from "@/ai-review/rules";
import { buildClaimCheckResult } from "@/domain/claim-check";
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
  ClaimCheckResult,
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
  SectionObjectRef,
  SupportAsset
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

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
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

function pushAuditLog(
  graph: ResearchObjectGraph,
  input: Omit<Parameters<typeof createAuditLogEntry>[0], "id">
) {
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
  const seededImageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
      <rect width="1400" height="900" fill="#f5f7f2"/>
      <rect x="110" y="110" width="1180" height="680" rx="28" fill="#ffffff" stroke="#dfe4dd" stroke-width="8"/>
      <text x="170" y="210" font-size="48" font-family="Arial" fill="#235b45">Preview Figure 1</text>
      <text x="170" y="270" font-size="28" font-family="Arial" fill="#68716a">Primary cohort marker B response</text>
      <polyline points="180,650 340,520 500,470 660,390 820,330 980,280 1140,250" fill="none" stroke="#235b45" stroke-width="14"/>
      <circle cx="340" cy="520" r="16" fill="#235b45"/>
      <circle cx="500" cy="470" r="16" fill="#235b45"/>
      <circle cx="660" cy="390" r="16" fill="#235b45"/>
      <circle cx="820" cy="330" r="16" fill="#235b45"/>
      <circle cx="980" cy="280" r="16" fill="#235b45"/>
      <circle cx="1140" cy="250" r="16" fill="#235b45"/>
      <text x="180" y="720" font-size="26" font-family="Arial" fill="#68716a">Seeded in preview mode for founder UI review.</text>
    </svg>`
  )}`;

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
    linkedAssetIds: ["support_asset_demo_data"],
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
    linkedAssetIds: ["support_asset_demo_text"],
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
    uploadedAssetIds: ["support_asset_demo_image"],
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

  const supportAssetImage: SupportAsset = {
    id: "support_asset_demo_image",
    type: "support_asset",
    manuscriptId: manuscript.id,
    supportCategory: "image",
    fileType: "image/svg+xml",
    originalFilename: "primary-cohort-marker-b-response.svg",
    storageKey: "preview_primary_cohort_marker_b.svg",
    publicUrl: seededImageUrl,
    sizeBytes: 16482,
    contentDigest: simpleHash(seededImageUrl),
    linkedClaimIds: [claimOne.id],
    claimLinks: [{ claimId: claimOne.id, status: "confirmed", linkedEntityType: "figure", linkedEntityId: figureOne.id }],
    derivedEntityType: "figure",
    derivedEntityId: figureOne.id,
    status: "available",
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  const supportAssetData: SupportAsset = {
    id: "support_asset_demo_data",
    type: "support_asset",
    manuscriptId: manuscript.id,
    supportCategory: "data",
    fileType: "text/csv",
    originalFilename: "primary-cohort-marker-b.csv",
    storageKey: "preview_primary_cohort_marker_b.csv",
    sizeBytes: 482,
    contentDigest: simpleHash("group,timepoint,marker_b\ncontrol,baseline,7.1\ntreatment,day14,4.2"),
    extractedText: "group,timepoint,marker_b\ncontrol,baseline,7.1\ntreatment,day14,4.2",
    textPreview: "group,timepoint,marker_b\ncontrol,baseline,7.1\ntreatment,day14,4.2",
    linkedClaimIds: [claimOne.id],
    claimLinks: [{ claimId: claimOne.id, status: "confirmed", linkedEntityType: "evidence", linkedEntityId: evidenceOne.id }],
    derivedEntityType: "evidence",
    derivedEntityId: evidenceOne.id,
    status: "available",
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

  const supportAssetText: SupportAsset = {
    id: "support_asset_demo_text",
    type: "support_asset",
    manuscriptId: manuscript.id,
    supportCategory: "text",
    fileType: "text/plain",
    originalFilename: "resistant-subgroup-note.txt",
    storageKey: "preview_resistant_subgroup_note.txt",
    sizeBytes: 301,
    contentDigest: simpleHash("Resistant subgroup note: baseline marker B was higher before dosing."),
    extractedText: "Resistant subgroup note: baseline marker B was higher before dosing.",
    textPreview: "Resistant subgroup note: baseline marker B was higher before dosing.",
    linkedClaimIds: [claimTwo.id],
    claimLinks: [{ claimId: claimTwo.id, status: "proposed", linkedEntityType: "evidence", linkedEntityId: noteOne.id }],
    derivedEntityType: "evidence",
    derivedEntityId: noteOne.id,
    status: "available",
    createdBy: correspondingAuthor.id,
    createdAt,
    updatedAt: createdAt
  };

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
    supportAssets: [supportAssetImage, supportAssetData, supportAssetText],
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

export async function listProjects(): Promise<Project[]> {
  const nextState = await getState();
  return clone(nextState.projects);
}

export async function createProject(input: { name: string; description?: string; createdBy?: string }): Promise<Project> {
  return updateState(async (nextState) => {
    const timestamp = nowIso();
    const project: Project = {
      id: createId("project"),
      type: "project",
      name: input.name,
      description: input.description,
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    nextState.projects.unshift(project);
    nextState.projectDirectories[project.id] = { authors: [], projectMembers: [] };
    return clone(project);
  });
}

export async function listManuscripts(projectId?: string): Promise<Manuscript[]> {
  const nextState = await getState();
  return Object.values(nextState.graphsByManuscriptId)
    .map((graph) => graph.manuscript)
    .filter((manuscript) => !projectId || manuscript.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((manuscript) => clone(manuscript));
}

export async function createManuscript(input: ManuscriptInput): Promise<Manuscript> {
  return updateState(async (nextState) => {
    const project = getProject(nextState, input.projectId);
    const timestamp = nowIso();
    const manuscript: Manuscript = {
      id: createId("manuscript"),
      type: "manuscript",
      projectId: project.id,
      title: input.title,
      shortTitle: input.shortTitle,
      abstract: input.abstract,
      keywords: input.keywords ?? [],
      articleType: input.articleType ?? "research_article",
      submissionStatus: "draft",
      metadata: {},
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const directory = getProjectDirectory(nextState, project.id);
    nextState.graphsByManuscriptId[manuscript.id] = {
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
      authors: clone(directory.authors),
      projectMembers: clone(directory.projectMembers),
      manuscriptMembers: [],
      aiReviewResults: [],
      validityAssessments: [],
      claimFramingAssessments: [],
      datasets: [],
      softwareArtifacts: []
    };
    nextState.projectMemoryDigests[project.id] = timestamp;

    return clone(manuscript);
  });
}

export async function listAuthors(projectId?: string): Promise<Author[]> {
  const nextState = await getState();

  if (projectId) {
    return clone(getProjectDirectory(nextState, projectId).authors);
  }

  return clone(Object.values(nextState.projectDirectories).flatMap((directory) => directory.authors));
}

export async function createAuthor(input: {
  projectId?: string;
  manuscriptId?: string;
  displayName: string;
  email?: string;
  orcid?: string;
  memberRole?: MemberRole;
  contributorRoles?: string[];
  createdBy?: string;
}): Promise<Author> {
  return updateState(async (nextState) => {
    const manuscript = input.manuscriptId ? getGraphEntry(nextState, input.manuscriptId).graph.manuscript : null;
    const projectId = input.projectId ?? manuscript?.projectId;

    if (!projectId) {
      throw new Error("projectId or manuscriptId is required when creating an author in preview mode.");
    }

    const directory = getProjectDirectory(nextState, projectId);
    const role = input.memberRole ?? "coauthor";
    const author: Author = {
      id: createId("author"),
      type: "author",
      projectId,
      displayName: input.displayName,
      email: input.email,
      orcid: input.orcid
    };

    directory.authors = [...directory.authors, author];
    directory.projectMembers = [
      ...directory.projectMembers,
      {
        id: createId("project_member"),
        projectId,
        authorId: author.id,
        role: role === "owner" ? "owner" : "coauthor",
        addedBy: input.createdBy,
        createdAt: nowIso()
      }
    ];

    if (manuscript) {
      const graph = nextState.graphsByManuscriptId[manuscript.id];
      graph.authors = [...(graph.authors ?? []), author];
      graph.projectMembers = clone(directory.projectMembers);
      graph.manuscriptMembers = [
        ...(graph.manuscriptMembers ?? []),
        {
          id: createId("manuscript_member"),
          manuscriptId: manuscript.id,
          authorId: author.id,
          role,
          addedBy: input.createdBy,
          createdAt: nowIso()
        }
      ];
    }

    return clone(author);
  });
}

export async function getActorMembershipContext(actorId: string, manuscriptId?: string) {
  const nextState = await getState();
  const author = await findDemoAuthorById(actorId);

  if (!author) {
    throw new Error(`Author ${actorId} was not found.`);
  }

  const graph = manuscriptId ? getGraphEntry(nextState, manuscriptId).graph : undefined;
  const projectId = graph?.manuscript.projectId ?? author.projectId;
  const directory = getProjectDirectory(nextState, projectId);
  const projectRole = directory.projectMembers.find((member) => member.authorId === actorId)?.role ?? null;
  const manuscriptRole = graph?.manuscriptMembers?.find((member) => member.authorId === actorId)?.role ?? null;

  return {
    actor: clone(author),
    manuscriptId: graph?.manuscript.id,
    manuscriptTitle: graph?.manuscript.title,
    projectRole,
    manuscriptRole,
    allowedActions: {
      canApproveClaim: Boolean(manuscriptRole),
      canApproveClaimEvidence: Boolean(manuscriptRole),
      canConfirmFinalIntent: projectRole === "owner" || manuscriptRole === "owner" || manuscriptRole === "corresponding_author"
    }
  };
}

export async function getResearchObjectGraph(manuscriptId?: string): Promise<ResearchObjectGraph> {
  const nextState = await getState();
  const { graph } = getGraphEntry(nextState, manuscriptId);
  return hydrateGraph(nextState, graph);
}

export async function listClaims(manuscriptId?: string): Promise<Claim[]> {
  return (await getResearchObjectGraph(manuscriptId)).claims;
}

export async function createClaim(input: { manuscriptId: string; text: string; createdBy?: string }): Promise<Claim> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();
    const claim: Claim = {
      id: createId("claim"),
      type: "claim",
      manuscriptId: graph.manuscript.id,
      text: input.text,
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
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const framedClaim = await refreshClaimFraming(graph, claim);
    graph.claims = [framedClaim, ...graph.claims];
    graph.manuscript.updatedAt = timestamp;
    pushAuditLog(graph, {
      projectId: graph.manuscript.projectId,
      manuscriptId: graph.manuscript.id,
      actor: actorFromAuthor((await findDemoAuthorById(input.createdBy ?? nextState.defaultActorId)) ?? {
        id: nextState.defaultActorId,
        type: "author",
        projectId: graph.manuscript.projectId,
        displayName: "Preview author"
      }),
      action: "claim.created",
      targetEntityType: "claim",
      targetEntityId: framedClaim.id,
      sourceClassification: "human",
      afterSnapshot: { text: framedClaim.text, claimType: framedClaim.claimType, strengthLevel: framedClaim.strengthLevel }
    });

    return clone(framedClaim);
  });
}

export async function updateClaim(input: { claimId: string; text: string; updatedBy?: string }): Promise<Claim> {
  return updateState(async (nextState) => {
    const { graph } = getGraphByClaimId(nextState, input.claimId);
    const claim = findClaim(graph, input.claimId);
    const beforeSnapshot = { text: claim.text, claimType: claim.claimType, strengthLevel: claim.strengthLevel };
    const reframed = await refreshClaimFraming(graph, {
      ...claim,
      text: input.text,
      updatedAt: nowIso()
    });

    replaceClaim(graph, reframed);
    graph.manuscript.updatedAt = reframed.updatedAt;
    pushAuditLog(graph, {
      projectId: graph.manuscript.projectId,
      manuscriptId: graph.manuscript.id,
      actor: actorFromAuthor((await findDemoAuthorById(input.updatedBy ?? nextState.defaultActorId)) ?? {
        id: nextState.defaultActorId,
        type: "author",
        projectId: graph.manuscript.projectId,
        displayName: "Preview author"
      }),
      action: "claim.updated",
      targetEntityType: "claim",
      targetEntityId: reframed.id,
      sourceClassification: "human",
      beforeSnapshot,
      afterSnapshot: { text: reframed.text, claimType: reframed.claimType, strengthLevel: reframed.strengthLevel }
    });

    return clone(reframed);
  });
}

export async function listEvidence(manuscriptId?: string): Promise<Evidence[]> {
  return (await getResearchObjectGraph(manuscriptId)).evidence;
}

export async function listSupportAssets(manuscriptId?: string): Promise<SupportAsset[]> {
  return (await getResearchObjectGraph(manuscriptId)).supportAssets ?? [];
}

export async function createSupportAsset(input: {
  manuscriptId: string;
  supportCategory: SupportAsset["supportCategory"];
  fileType: string;
  originalFilename: string;
  storageKey: string;
  publicUrl?: string;
  sizeBytes: number;
  contentDigest: string;
  extractedText?: string;
  textPreview?: string;
  derivedEntityType: SupportAsset["derivedEntityType"];
  derivedEntityId: string;
  createdBy?: string;
}): Promise<SupportAsset> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();
    const asset: SupportAsset = {
      id: createId("support_asset"),
      type: "support_asset",
      manuscriptId: graph.manuscript.id,
      supportCategory: input.supportCategory,
      fileType: input.fileType,
      originalFilename: input.originalFilename,
      storageKey: input.storageKey,
      publicUrl: input.publicUrl,
      sizeBytes: input.sizeBytes,
      contentDigest: input.contentDigest,
      extractedText: input.extractedText,
      textPreview: input.textPreview,
      linkedClaimIds: [],
      claimLinks: [],
      derivedEntityType: input.derivedEntityType,
      derivedEntityId: input.derivedEntityId,
      status: "available",
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    graph.supportAssets = [asset, ...(graph.supportAssets ?? [])];
    if (asset.derivedEntityType === "evidence") {
      graph.evidence = graph.evidence.map((item) =>
        item.id === asset.derivedEntityId
          ? {
              ...item,
              linkedAssetIds: uniqueStrings([...item.linkedAssetIds, asset.id]),
              updatedAt: timestamp
            }
          : item
      );
    }

    if (asset.derivedEntityType === "figure") {
      graph.figures = graph.figures.map((item) =>
        item.id === asset.derivedEntityId
          ? {
              ...item,
              uploadedAssetIds: uniqueStrings([...item.uploadedAssetIds, asset.id]),
              updatedAt: timestamp
            }
          : item
      );
    }

    graph.manuscript.updatedAt = timestamp;
    return clone(asset);
  });
}

export async function createEvidence(input: {
  manuscriptId: string;
  evidenceType: Evidence["evidenceType"];
  summary: string;
  linkedClaimIds?: string[];
  linkedAssetIds?: string[];
  confidenceNotes?: string;
  createdBy?: string;
}): Promise<Evidence> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();
    const evidence: Evidence = {
      id: createId("evidence"),
      type: "evidence",
      manuscriptId: graph.manuscript.id,
      evidenceType: input.evidenceType,
      summary: input.summary,
      linkedAssetIds: input.linkedAssetIds ?? [],
      linkedClaimIds: input.linkedClaimIds ?? [],
      confidenceNotes: input.confidenceNotes,
      provenanceIds: [],
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    graph.evidence = [evidence, ...graph.evidence];
    graph.claims = graph.claims.map((claim) =>
      (input.linkedClaimIds ?? []).includes(claim.id)
        ? {
            ...claim,
            linkedEvidence: [
              ...claim.linkedEvidence.filter((link) => link.evidenceId !== evidence.id),
              { evidenceId: evidence.id, status: "proposed" }
            ],
            updatedAt: timestamp
          }
        : claim
    );
    graph.manuscript.updatedAt = timestamp;

    return clone(evidence);
  });
}

export async function updateEvidence(input: {
  evidenceId: string;
  evidenceType: Evidence["evidenceType"];
  summary: string;
  confidenceNotes?: string;
  updatedBy?: string;
}): Promise<Evidence> {
  return updateState(async (nextState) => {
    const { graph } = getGraphByEvidenceId(nextState, input.evidenceId);
    const evidence = graph.evidence.find((item) => item.id === input.evidenceId);

    if (!evidence) {
      throw new Error(`Evidence ${input.evidenceId} was not found.`);
    }

    const updated: Evidence = {
      ...evidence,
      evidenceType: input.evidenceType,
      summary: input.summary,
      confidenceNotes: input.confidenceNotes,
      updatedAt: nowIso()
    };

    graph.evidence = graph.evidence.map((item) => (item.id === updated.id ? updated : item));
    graph.manuscript.updatedAt = updated.updatedAt;
    return clone(updated);
  });
}

export async function listFigures(manuscriptId?: string): Promise<Figure[]> {
  return (await getResearchObjectGraph(manuscriptId)).figures;
}

export async function createFigure(input: {
  manuscriptId: string;
  title: string;
  caption: string;
  figureNumber?: string;
  linkedClaimIds?: string[];
  linkedEvidenceIds?: string[];
  uploadedAssetIds?: string[];
  createdBy?: string;
}): Promise<Figure> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();
    const figure: Figure = {
      id: createId("figure"),
      type: "figure",
      manuscriptId: graph.manuscript.id,
      figureNumber: input.figureNumber,
      title: input.title,
      caption: input.caption,
      uploadedAssetIds: input.uploadedAssetIds ?? [],
      rawDataLinkIds: [],
      linkedClaimIds: input.linkedClaimIds ?? [],
      linkedEvidenceIds: input.linkedEvidenceIds ?? [],
      linkedMethodBlockIds: [],
      status: "draft",
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    graph.figures = [figure, ...graph.figures];
    graph.claims = graph.claims.map((claim) =>
      figure.linkedClaimIds.includes(claim.id)
        ? { ...claim, sourceFigures: updateClaimFigureLink(claim, figure.id, "proposed"), updatedAt: timestamp }
        : claim
    );
    graph.manuscript.updatedAt = timestamp;
    return clone(figure);
  });
}

export async function updateSupportAssetClaimMapping(input: {
  manuscriptId?: string;
  supportAssetId: string;
  claimId: string;
  status: LinkStatus;
  actorId: string;
}) {
  return updateState(async (nextState) => {
    const graphEntry = input.manuscriptId
      ? getGraphEntry(nextState, input.manuscriptId)
      : (() => {
          const entry = Object.entries(nextState.graphsByManuscriptId).find(([, candidateGraph]) =>
            (candidateGraph.supportAssets ?? []).some((asset) => asset.id === input.supportAssetId)
          );

          if (!entry) {
            throw new Error(`Support asset ${input.supportAssetId} was not found.`);
          }

          return { manuscriptId: entry[0], graph: entry[1] };
        })();
    const graph = graphEntry.graph;
    const asset = (graph.supportAssets ?? []).find((item) => item.id === input.supportAssetId);

    if (!asset) {
      throw new Error(`Support asset ${input.supportAssetId} was not found.`);
    }

    const claim = findClaim(graph, input.claimId);
    const timestamp = nowIso();
    const nextClaimLinks = [
      ...asset.claimLinks.filter((link) => link.claimId !== input.claimId),
      {
        claimId: input.claimId,
        status: input.status,
        linkedEntityType: asset.derivedEntityType,
        linkedEntityId: asset.derivedEntityId
      }
    ];

    const nextAsset: SupportAsset = {
      ...asset,
      claimLinks: nextClaimLinks,
      linkedClaimIds: nextClaimLinks.filter((link) => link.status !== "rejected").map((link) => link.claimId),
      updatedAt: timestamp
    };

    graph.supportAssets = (graph.supportAssets ?? []).map((item) => (item.id === nextAsset.id ? nextAsset : item));

    if (asset.derivedEntityType === "evidence") {
      const evidence = graph.evidence.find((item) => item.id === asset.derivedEntityId);

      if (!evidence) {
        throw new Error(`Evidence ${asset.derivedEntityId} was not found for support mapping.`);
      }

      const updatedEvidence: Evidence = {
        ...evidence,
        linkedClaimIds: uniqueStrings([
          ...evidence.linkedClaimIds.filter((claimId) => claimId !== input.claimId),
          ...(input.status === "rejected" ? [] : [input.claimId])
        ]),
        updatedAt: timestamp
      };

      graph.evidence = graph.evidence.map((item) => (item.id === updatedEvidence.id ? updatedEvidence : item));

      const updatedClaim: Claim = {
        ...claim,
        linkedEvidence: [
          ...claim.linkedEvidence.filter((link) => link.evidenceId !== evidence.id),
          {
            evidenceId: evidence.id,
            status: input.status,
            confirmedBy: input.status === "confirmed" ? input.actorId : undefined,
            confirmedAt: input.status === "confirmed" ? timestamp : undefined
          }
        ],
        updatedAt: timestamp
      };
      replaceClaim(graph, updatedClaim);
    } else {
      const figure = graph.figures.find((item) => item.id === asset.derivedEntityId);

      if (!figure) {
        throw new Error(`Figure ${asset.derivedEntityId} was not found for support mapping.`);
      }

      const updatedFigure: Figure = {
        ...figure,
        linkedClaimIds: uniqueStrings([
          ...figure.linkedClaimIds.filter((claimId) => claimId !== input.claimId),
          ...(input.status === "rejected" ? [] : [input.claimId])
        ]),
        updatedAt: timestamp
      };

      graph.figures = graph.figures.map((item) => (item.id === updatedFigure.id ? updatedFigure : item));

      const updatedClaim: Claim = {
        ...claim,
        sourceFigures: [
          ...claim.sourceFigures.filter((link) => link.entityId !== figure.id),
          { entityId: figure.id, status: input.status }
        ],
        updatedAt: timestamp
      };
      replaceClaim(graph, updatedClaim);
    }

    graph.manuscript.updatedAt = timestamp;

    pushAuditLog(graph, {
      projectId: graph.manuscript.projectId,
      manuscriptId: graph.manuscript.id,
      actor: actorFromAuthor((await findDemoAuthorById(input.actorId)) ?? {
        id: input.actorId,
        type: "author",
        projectId: graph.manuscript.projectId,
        displayName: "Preview author"
      }),
      action: `support_asset.claim_link_${input.status}`,
      targetEntityType: "support_asset",
      targetEntityId: nextAsset.id,
      sourceClassification: "human",
      context: { claimId: input.claimId, derivedEntityType: nextAsset.derivedEntityType, derivedEntityId: nextAsset.derivedEntityId }
    });

    return clone(nextAsset);
  });
}

export async function listMethods(manuscriptId?: string): Promise<MethodBlock[]> {
  return (await getResearchObjectGraph(manuscriptId)).methods;
}

export async function createMethodBlock(input: {
  manuscriptId: string;
  title: string;
  content: string;
  protocolType?: string;
  linkedClaimIds?: string[];
  linkedFigureIds?: string[];
  reproducibilityNotes?: string;
  createdBy?: string;
}): Promise<MethodBlock> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();
    const method: MethodBlock = {
      id: createId("method"),
      type: "method_block",
      manuscriptId: graph.manuscript.id,
      title: input.title,
      content: input.content,
      protocolType: input.protocolType,
      linkedClaimIds: input.linkedClaimIds ?? [],
      linkedFigureIds: input.linkedFigureIds ?? [],
      reproducibilityNotes: input.reproducibilityNotes,
      status: "draft",
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    graph.methods = [method, ...graph.methods];
    graph.claims = graph.claims.map((claim) =>
      method.linkedClaimIds.includes(claim.id)
        ? { ...claim, linkedMethods: updateEntityLink(claim.linkedMethods, method.id, "confirmed"), updatedAt: timestamp }
        : claim
    );
    graph.manuscript.updatedAt = timestamp;
    return clone(method);
  });
}

export async function listLimitations(manuscriptId?: string): Promise<Limitation[]> {
  return (await getResearchObjectGraph(manuscriptId)).limitations;
}

export async function createLimitation(input: {
  manuscriptId: string;
  text: string;
  scope?: string;
  linkedClaimIds?: string[];
  severityOrImportance?: string;
  createdBy?: string;
}): Promise<Limitation> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();
    const limitation: Limitation = {
      id: createId("limitation"),
      type: "limitation",
      manuscriptId: graph.manuscript.id,
      text: input.text,
      scope: input.scope,
      linkedClaimIds: input.linkedClaimIds ?? [],
      severityOrImportance: input.severityOrImportance,
      status: "draft",
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    graph.limitations = [limitation, ...graph.limitations];
    graph.claims = graph.claims.map((claim) =>
      limitation.linkedClaimIds.includes(claim.id)
        ? { ...claim, linkedLimitations: updateEntityLink(claim.linkedLimitations, limitation.id, "confirmed"), updatedAt: timestamp }
        : claim
    );
    graph.manuscript.updatedAt = timestamp;
    return clone(limitation);
  });
}

export async function listCitations(manuscriptId?: string): Promise<Citation[]> {
  return (await getResearchObjectGraph(manuscriptId)).citations;
}

export async function createCitation(input: {
  manuscriptId: string;
  citationKey: string;
  doi?: string;
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  linkedClaimIds?: string[];
  createdBy?: string;
}): Promise<Citation> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();
    const citation: Citation = {
      id: createId("citation"),
      type: "citation",
      manuscriptId: graph.manuscript.id,
      citationKey: input.citationKey,
      doi: input.doi,
      title: input.title,
      authors: input.authors,
      journal: input.journal,
      year: input.year,
      volume: input.volume,
      issue: input.issue,
      pages: input.pages,
      url: input.url,
      linkedClaimIds: input.linkedClaimIds ?? [],
      linkedSectionIds: [],
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    graph.citations = [citation, ...graph.citations];
    graph.claims = graph.claims.map((claim) =>
      citation.linkedClaimIds.includes(claim.id)
        ? { ...claim, linkedCitations: updateEntityLink(claim.linkedCitations, citation.id, "confirmed"), updatedAt: timestamp }
        : claim
    );
    graph.manuscript.updatedAt = timestamp;
    return clone(citation);
  });
}

export async function createSection(input: {
  manuscriptId: string;
  title: string;
  objectRefs: SectionObjectRef[];
  createdBy?: string;
}): Promise<Section> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();
    const section: Section = {
      id: createId("section"),
      type: "section",
      manuscriptId: graph.manuscript.id,
      title: input.title,
      orderIndex: graph.sections.length + 1,
      objectRefs: input.objectRefs,
      status: "draft",
      createdBy: input.createdBy ?? nextState.defaultActorId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    graph.sections = [...graph.sections, section];
    graph.manuscript.updatedAt = timestamp;
    return clone(section);
  });
}

export async function updateClaimSectionPlacement(input: {
  manuscriptId: string;
  claimId: string;
  sectionId?: string;
  sectionTitle?: string;
  updatedBy?: string;
}): Promise<Section> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const timestamp = nowIso();

    graph.sections = graph.sections.map((section) => ({
      ...section,
      objectRefs: section.objectRefs.filter((ref) => !(ref.entityType === "claim" && ref.entityId === input.claimId))
    }));

    let section = input.sectionId ? graph.sections.find((item) => item.id === input.sectionId) : undefined;

    if (!section && input.sectionTitle) {
      section = {
        id: createId("section"),
        type: "section",
        manuscriptId: graph.manuscript.id,
        title: input.sectionTitle,
        orderIndex: graph.sections.length + 1,
        objectRefs: [],
        status: "draft",
        createdBy: input.updatedBy ?? nextState.defaultActorId,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      graph.sections = [...graph.sections, section];
    }

    if (!section) {
      throw new Error("Section placement requires an existing section or a new section title.");
    }

    section.objectRefs = [...section.objectRefs, { entityType: "claim", entityId: input.claimId, orderIndex: section.objectRefs.length + 1 }];
    section.updatedAt = timestamp;
    graph.sections = graph.sections.map((item) => (item.id === section!.id ? section! : item));
    graph.manuscript.updatedAt = timestamp;
    return clone(section);
  });
}

export async function runReview(manuscriptId?: string): Promise<AIReviewResult[]> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, manuscriptId);
    graph.aiReviewResults = runDeterministicAiReview(graph);
    pushAuditLog(graph, {
      projectId: graph.manuscript.projectId,
      manuscriptId: graph.manuscript.id,
      actor: AI_REVIEW_ACTOR,
      action: "ai_review.completed",
      targetEntityType: "manuscript",
      targetEntityId: graph.manuscript.id,
      sourceClassification: "ai_suggestion",
      context: { resultCount: graph.aiReviewResults.length }
    });
    graph.manuscript.updatedAt = nowIso();
    return clone(graph.aiReviewResults);
  });
}

export async function listLatestClaimValidityAssessments(input?: {
  manuscriptId?: string;
  claimId?: string;
}): Promise<ClaimValidityAssessment[]> {
  const graph = await getResearchObjectGraph(input?.manuscriptId);
  return selectLatestClaimValidityAssessments({ assessments: graph.validityAssessments ?? [], graph, claimId: input?.claimId });
}

export async function assessClaimValidity(input: {
  manuscriptId?: string;
  claimId: string;
}): Promise<ClaimValidityAssessment> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId ?? getGraphByClaimId(nextState, input.claimId).manuscriptId);
    const assessment = buildClaimValidityAssessment({
      graph: hydrateGraph(nextState, graph),
      claimId: input.claimId,
      assessmentId: createId("validity"),
      now: nowIso()
    });

    graph.validityAssessments = [assessment, ...(graph.validityAssessments ?? [])];
    pushAuditLog(graph, {
      projectId: graph.manuscript.projectId,
      manuscriptId: graph.manuscript.id,
      actor: SYSTEM_ACTOR,
      action: "claim.validity_assessed",
      targetEntityType: "claim_validity_assessment",
      targetEntityId: assessment.assessmentId,
      targetSnapshotRef: assessment.basedOnSnapshotRef,
      sourceClassification: "system",
      context: { claimId: assessment.claimId, scoreBand: assessment.scoreBand, score: assessment.overallValidityScore }
    });
    return clone(assessment);
  });
}

export async function getClaimCheckResult(input: {
  manuscriptId?: string;
  claimId: string;
}): Promise<ClaimCheckResult | null> {
  const graph = await getResearchObjectGraph(input.manuscriptId ?? getGraphByClaimId(await getState(), input.claimId).manuscriptId);
  const assessment = selectLatestClaimValidityAssessments({
    assessments: graph.validityAssessments ?? [],
    graph,
    claimId: input.claimId
  })[0];

  if (!assessment) {
    return null;
  }

  return buildClaimCheckResult({
    graph,
    claimId: input.claimId,
    assessment
  });
}

export async function runClaimCheck(input: {
  manuscriptId?: string;
  claimId: string;
}): Promise<ClaimCheckResult> {
  const assessment = await assessClaimValidity(input);
  const graph = await getResearchObjectGraph(input.manuscriptId ?? assessment.manuscriptId);
  await digestProjectMemory(graph.manuscript.projectId);

  return buildClaimCheckResult({
    graph,
    claimId: input.claimId,
    assessment
  });
}

export async function getClaimTrustContracts(manuscriptId?: string): Promise<ClaimTrustReadiness[]> {
  return (await getResearchObjectGraph(manuscriptId)).claimTrustReadiness ?? [];
}

export async function getManuscriptTrustContract(manuscriptId?: string) {
  return getManuscriptTrustReadiness(await getResearchObjectGraph(manuscriptId));
}

export async function digestProjectMemory(projectId?: string): Promise<ProjectMemorySummary> {
  return updateState(async (nextState) => {
    const project = getProject(nextState, projectId);
    const digestedAt = nowIso();
    nextState.projectMemoryDigests[project.id] = digestedAt;
    return buildProjectMemorySummary({
      projectId: project.id,
      graphs: Object.values(nextState.graphsByManuscriptId)
        .filter((graph) => graph.manuscript.projectId === project.id)
        .map((graph) => hydrateGraph(nextState, graph)),
      now: digestedAt
    });
  });
}

export async function getProjectMemory(projectId?: string): Promise<ProjectMemorySummary> {
  const nextState = await getState();
  const project = getProject(nextState, projectId);

  return buildProjectMemorySummary({
    projectId: project.id,
    graphs: Object.values(nextState.graphsByManuscriptId)
      .filter((graph) => graph.manuscript.projectId === project.id)
      .map((graph) => hydrateGraph(nextState, graph)),
    now: nextState.projectMemoryDigests[project.id] ?? nowIso()
  });
}

export async function answerProjectDiscussion(input: {
  projectId?: string;
  question: string;
  claimIds?: string[];
  requestedMode?: DiscussionRequestedMode;
}): Promise<GroundedDiscussionAnswer> {
  return generateGroundedDiscussion({
    memory: await getProjectMemory(input.projectId),
    question: input.question,
    claimIds: input.claimIds,
    requestedMode: input.requestedMode
  });
}

export async function getClaimDiscussionThread(claimId: string): Promise<ClaimDiscussionThread> {
  return updateState(async (nextState) => {
    const { graph } = getGraphByClaimId(nextState, claimId);
    const existing = nextState.claimThreads[claimId];
    if (existing) return clone(existing);

    const thread: ClaimDiscussionThread = {
      id: createId("claim_thread"),
      type: "claim_discussion_thread",
      manuscriptId: graph.manuscript.id,
      claimId,
      title: `Validity notes for ${findClaim(graph, claimId).text.slice(0, 48)}`,
      createdBy: nextState.defaultActorId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: []
    };
    nextState.claimThreads[claimId] = thread;
    return clone(thread);
  });
}

export async function askClaimDiscussion(input: {
  claimId: string;
  question: string;
  actorId: string;
  requestedMode?: DiscussionRequestedMode;
}): Promise<{ thread: ClaimDiscussionThread; answer: GroundedDiscussionAnswer }> {
  return updateState(async (nextState) => {
    const { graph } = getGraphByClaimId(nextState, input.claimId);
    const memory = await getProjectMemory(graph.manuscript.projectId);
    const currentThread =
      nextState.claimThreads[input.claimId] ??
      ({
        id: createId("claim_thread"),
        type: "claim_discussion_thread",
        manuscriptId: graph.manuscript.id,
        claimId: input.claimId,
        title: `Validity notes for ${findClaim(graph, input.claimId).text.slice(0, 48)}`,
        createdBy: input.actorId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        messages: []
      } satisfies ClaimDiscussionThread);

    const answer = await generateGroundedDiscussion({
      memory,
      question: input.question,
      claimIds: [input.claimId],
      requestedMode: input.requestedMode,
      priorTurns: currentThread.messages.map((message) => ({ role: message.role, content: message.content }))
    });

    const createdAt = nowIso();
    const nextThread: ClaimDiscussionThread = {
      ...currentThread,
      updatedAt: createdAt,
      messages: [
        ...currentThread.messages,
        {
          id: createId("claim_discussion_message"),
          type: "claim_discussion_message",
          manuscriptId: graph.manuscript.id,
          claimId: input.claimId,
          threadId: currentThread.id,
          role: "user",
          content: input.question,
          groundingClaimIds: [input.claimId],
          groundingObjectIds: [],
          createdBy: input.actorId,
          createdAt
        },
        {
          id: createId("claim_discussion_message"),
          type: "claim_discussion_message",
          manuscriptId: graph.manuscript.id,
          claimId: input.claimId,
          threadId: currentThread.id,
          role: "assistant",
          content: answer.answer,
          sourceMode: answer.sourceMode,
          fallbackReason: answer.fallbackReason,
          groundingClaimIds: answer.referencedClaimIds,
          groundingObjectIds: answer.usedMemoryObjectIds,
          createdAt
        }
      ]
    };

    nextState.claimThreads[input.claimId] = nextThread;
    return { thread: clone(nextThread), answer };
  });
}

export async function approveClaim(
  claimId: string,
  actorId: string,
  options?: { notes?: string; targetVersionId?: string; targetSnapshotRef?: string }
): Promise<{ claim: Claim; approvalEvent: ApprovalEvent }> {
  return updateState(async (nextState) => {
    const { graph } = getGraphByClaimId(nextState, claimId);
    const context = resolveAuthority(nextState, graph.manuscript.id, actorId);
    assertCanApproveClaimAuthority({ actor: context.actor, authority: context.authority });
    const claim = findClaim(graph, claimId);
    const targetSnapshotRef = options?.targetSnapshotRef ?? createCurrentClaimTrustSnapshotRef(hydrateGraph(nextState, graph), claim.id);
    const result = applyClaimApproval({
      claim,
      actor: context.actor,
      authority: context.authority,
      approvalEventId: createId("approval"),
      notes: options?.notes
    });

    replaceClaim(graph, result.claim);
    const approvalEvent = { ...result.approvalEvent, targetVersionId: options?.targetVersionId, targetSnapshotRef };
    graph.approvals = [approvalEvent, ...graph.approvals];
    return { claim: clone(result.claim), approvalEvent: clone(approvalEvent) };
  });
}

export async function approveClaimEvidenceLink(input: {
  claimId: string;
  evidenceId: string;
  actorId: string;
  notes?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
}): Promise<{ claim: Claim; approvalEvent: ApprovalEvent }> {
  return updateState(async (nextState) => {
    const { graph } = getGraphByClaimId(nextState, input.claimId);
    const context = resolveAuthority(nextState, graph.manuscript.id, input.actorId);
    assertCanApproveClaimEvidenceAuthority({ actor: context.actor, authority: context.authority });
    const claim = findClaim(graph, input.claimId);
    const updatedClaim: Claim = {
      ...claim,
      linkedEvidence: [
        ...claim.linkedEvidence.filter((link) => link.evidenceId !== input.evidenceId),
        { evidenceId: input.evidenceId, status: "confirmed", confirmedBy: input.actorId, confirmedAt: nowIso() }
      ],
      updatedAt: nowIso()
    };
    replaceClaim(graph, updatedClaim);

    const approvalEvent = createApprovalEvent({
      id: createId("approval"),
      manuscriptId: graph.manuscript.id,
      approvalType: "claim_evidence_approval",
      actor: context.actor,
      sourceClassification: "human",
      targetEntityType: "claim_evidence_link",
      targetEntityId: `${input.claimId}:${input.evidenceId}`,
      targetVersionId: input.targetVersionId,
      targetSnapshotRef:
        input.targetSnapshotRef ?? createCurrentClaimTrustSnapshotRef(hydrateGraph(nextState, graph), input.claimId),
      approved: true,
      notes: input.notes ?? "Author confirmed this claim-evidence linkage."
    });
    graph.approvals = [approvalEvent, ...graph.approvals];

    return { claim: clone(updatedClaim), approvalEvent: clone(approvalEvent) };
  });
}

export async function approveClaimMethodLink(input: {
  claimId: string;
  methodBlockId: string;
  actorId: string;
  notes?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
}) {
  return updateState(async (nextState) => {
    const { graph } = getGraphByClaimId(nextState, input.claimId);
    const context = resolveAuthority(nextState, graph.manuscript.id, input.actorId);
    assertCanApproveClaimMethodAuthority({ actor: context.actor, authority: context.authority });
    const claim = findClaim(graph, input.claimId);
    const updatedClaim: Claim = { ...claim, linkedMethods: updateEntityLink(claim.linkedMethods, input.methodBlockId, "confirmed"), updatedAt: nowIso() };
    replaceClaim(graph, updatedClaim);
    const approvalEvent = createApprovalEvent({
      id: createId("approval"),
      manuscriptId: graph.manuscript.id,
      approvalType: "claim_method_approval",
      actor: context.actor,
      sourceClassification: "human",
      targetEntityType: "claim_method_link",
      targetEntityId: `${input.claimId}:${input.methodBlockId}`,
      targetVersionId: input.targetVersionId,
      targetSnapshotRef:
        input.targetSnapshotRef ?? createCurrentClaimTrustSnapshotRef(hydrateGraph(nextState, graph), input.claimId),
      approved: true,
      notes: input.notes ?? "Author confirmed this claim-method linkage."
    });
    graph.approvals = [approvalEvent, ...graph.approvals];
    return { claim: clone(updatedClaim), approvalEvent: clone(approvalEvent) };
  });
}

export async function approveClaimLimitationLink(input: {
  claimId: string;
  limitationId: string;
  actorId: string;
  notes?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
}) {
  return updateState(async (nextState) => {
    const { graph } = getGraphByClaimId(nextState, input.claimId);
    const context = resolveAuthority(nextState, graph.manuscript.id, input.actorId);
    assertCanApproveClaimLimitationAuthority({ actor: context.actor, authority: context.authority });
    const claim = findClaim(graph, input.claimId);
    const updatedClaim: Claim = {
      ...claim,
      linkedLimitations: updateEntityLink(claim.linkedLimitations, input.limitationId, "confirmed"),
      updatedAt: nowIso()
    };
    replaceClaim(graph, updatedClaim);
    const approvalEvent = createApprovalEvent({
      id: createId("approval"),
      manuscriptId: graph.manuscript.id,
      approvalType: "claim_limitation_approval",
      actor: context.actor,
      sourceClassification: "human",
      targetEntityType: "claim_limitation_link",
      targetEntityId: `${input.claimId}:${input.limitationId}`,
      targetVersionId: input.targetVersionId,
      targetSnapshotRef:
        input.targetSnapshotRef ?? createCurrentClaimTrustSnapshotRef(hydrateGraph(nextState, graph), input.claimId),
      approved: true,
      notes: input.notes ?? "Author confirmed this claim-limitation linkage."
    });
    graph.approvals = [approvalEvent, ...graph.approvals];
    return { claim: clone(updatedClaim), approvalEvent: clone(approvalEvent) };
  });
}

export async function markClaimPublicationReady(claimId: string, actorId: string): Promise<Claim> {
  return updateState(async (nextState) => {
    const { graph } = getGraphByClaimId(nextState, claimId);
    const context = resolveAuthority(nextState, graph.manuscript.id, actorId);
    assertCanApproveClaimAuthority({ actor: context.actor, authority: context.authority });
    const trust = getClaimTrustReadiness(hydrateGraph(nextState, graph), claimId);

    if (!trust.publicationReadiness.ready) {
      throw new Error(trust.publicationReadiness.reasons.join(" "));
    }

    const claim = findClaim(graph, claimId);
    const updatedClaim: Claim = { ...claim, status: "publication_ready", publicationReady: true, updatedAt: nowIso() };
    replaceClaim(graph, updatedClaim);
    return clone(updatedClaim);
  });
}

export async function addFinalIntentApproval(input: {
  manuscriptId: string;
  actorId: string;
  notes?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
}): Promise<ApprovalEvent> {
  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input.manuscriptId);
    const context = resolveAuthority(nextState, graph.manuscript.id, input.actorId);
    assertCanConfirmFinalIntentAuthority({ actor: context.actor, authority: context.authority });
    const approvalEvent = createApprovalEvent({
      id: createId("approval"),
      manuscriptId: graph.manuscript.id,
      approvalType: "pre_export_intent_confirmation",
      actor: context.actor,
      sourceClassification: "human",
      targetEntityType: "manuscript",
      targetEntityId: graph.manuscript.id,
      targetVersionId: input.targetVersionId,
      targetSnapshotRef: input.targetSnapshotRef ?? createCurrentManuscriptTrustSnapshotRef(hydrateGraph(nextState, graph)),
      approved: true,
      notes: input.notes ?? "Author confirmed rendered article intent for export."
    });
    graph.approvals = [approvalEvent, ...graph.approvals];
    return clone(approvalEvent);
  });
}

export async function createExport(input?: {
  confirmFinalIntent?: boolean;
  actorId?: string;
  manuscriptId?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
  mode?: ExportMode;
}) {
  const actorId = input?.actorId;
  if (!actorId) throw new Error("actorId is required to create an export.");

  return updateState(async (nextState) => {
    const { graph } = getGraphEntry(nextState, input?.manuscriptId);

    if (input?.confirmFinalIntent) {
      const context = resolveAuthority(nextState, graph.manuscript.id, actorId);
      assertCanConfirmFinalIntentAuthority({ actor: context.actor, authority: context.authority });
      const approval = createApprovalEvent({
        id: createId("approval"),
        manuscriptId: graph.manuscript.id,
        approvalType: "pre_export_intent_confirmation",
        actor: context.actor,
        sourceClassification: "human",
        targetEntityType: "manuscript",
        targetEntityId: graph.manuscript.id,
        targetVersionId: input.targetVersionId,
        targetSnapshotRef: input.targetSnapshotRef ?? createCurrentManuscriptTrustSnapshotRef(hydrateGraph(nextState, graph)),
        approved: true,
        notes: "Author confirmed rendered article intent for export."
      });
      graph.approvals = [approval, ...graph.approvals.filter((item) => item.id !== approval.id)];
    }

    return createDocxPlaceholderExport({
      id: createId("export"),
      graph: hydrateGraph(nextState, graph),
      createdBy: actorId,
      versionId: input?.targetVersionId ?? "version_demo_preview",
      now: nowIso(),
      mode: input?.mode
    });
  });
}

export async function getStructuredManuscriptView(manuscriptId?: string) {
  const graph = await getResearchObjectGraph(manuscriptId);
  return {
    manuscript: graph.manuscript,
    sections: graph.sections,
    renderedText: renderManuscriptText(graph),
    objectCounts: {
      claims: graph.claims.length,
      evidence: graph.evidence.length,
      figures: graph.figures.length,
      methods: graph.methods.length,
      limitations: graph.limitations.length,
      citations: graph.citations.length
    }
  };
}

export async function resetDevelopmentQaData(): Promise<void> {
  statePromise = seedInitialState();
  await statePromise;
}

export async function seedDevelopmentQaScenario() {
  await resetDevelopmentQaData();
  const nextState = await getState();
  const graph = hydrateGraph(nextState, getGraphEntry(nextState, DEMO_MANUSCRIPT_ID).graph);
  const directory = getProjectDirectory(nextState, DEMO_PROJECT_ID);

  return {
    project: clone(getProject(nextState, DEMO_PROJECT_ID)),
    manuscript: clone(graph.manuscript),
    owner: clone(directory.authors.find((author) => author.id === DEMO_OWNER_ID)!),
    correspondingAuthor: clone(directory.authors.find((author) => author.id === DEMO_CORRESPONDING_ID)!),
    coauthor: clone(directory.authors.find((author) => author.id === DEMO_COAUTHOR_ID)!),
    claim: clone(graph.claims[0]),
    evidence: clone(graph.evidence[0]),
    figure: clone(graph.figures[0]),
    method: clone(graph.methods[0]),
    limitation: clone(graph.limitations[0]),
    section: clone(graph.sections[0])
  };
}
