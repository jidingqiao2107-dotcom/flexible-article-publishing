import { runDeterministicAiReview } from "@/ai-review/rules";
import {
  approveClaim as applyClaimApproval,
  assertCanApproveClaimAuthority,
  assertCanApproveClaimEvidenceAuthority,
  assertCanApproveClaimLimitationAuthority,
  assertCanApproveClaimMethodAuthority,
  assertCanConfirmFinalIntentAuthority,
  createApprovalEvent,
  createAuditLogEntry,
  getExportReadiness
} from "@/domain/policies";
import {
  assessClaimValidity as buildClaimValidityAssessment,
  selectLatestClaimValidityAssessments
} from "@/domain/validity";
import { answerGroundedDiscussion, buildProjectMemorySummary } from "@/domain/project-memory";
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
  Claim,
  Citation,
  ExportMode,
  ClaimValidityAssessment,
  ClaimTrustReadiness,
  ClaimType,
  Evidence,
  Figure,
  Limitation,
  Manuscript,
  ManuscriptInput,
  ManuscriptMember,
  MemberRole,
  MethodBlock,
  Project,
  ProjectMemorySummary,
  ProjectMember,
  ResearchObjectGraph,
  Section,
  SectionObjectRef,
  StrengthLevel,
  GroundedDiscussionAnswer
} from "@/domain/types";
import { createDocxPlaceholderExport, renderManuscriptText } from "@/export/docx-placeholder";
import { prisma } from "./prisma-client";

const SYSTEM_ACTOR: Actor = { id: "system_route_a", type: "system", displayName: "Route A System" };
const AI_REVIEW_ACTOR: Actor = {
  id: "ai_first_reviewer",
  type: "ai",
  displayName: "AI First Reviewer"
};

const iso = (value: Date | string | null | undefined) =>
  value ? (value instanceof Date ? value.toISOString() : value) : undefined;

const actorFromId = (actorId?: string): Actor =>
  actorId
    ? { id: actorId, type: "human_author", displayName: actorId }
    : SYSTEM_ACTOR;

const projectFromRecord = (record: any): Project => ({
  id: record.id,
  type: "project",
  name: record.name,
  description: record.description ?? undefined,
  createdBy: record.createdBy,
  createdAt: iso(record.createdAt)!,
  updatedAt: iso(record.updatedAt)!
});

const manuscriptFromRecord = (record: any): Manuscript => {
  const metadata = typeof record.richMetadata === "object" && record.richMetadata !== null ? record.richMetadata : {};

  return {
    id: record.id,
    type: "manuscript",
    projectId: record.projectId,
    title: record.title,
    shortTitle: record.shortTitle ?? undefined,
    abstract: record.abstract ?? undefined,
    keywords: record.keywords,
    articleType: record.articleType ?? undefined,
    submissionStatus: record.submissionStatus,
    metadata: {
      ...(metadata as Manuscript["metadata"]),
      acknowledgements: record.acknowledgements ?? undefined,
      license: record.license ?? undefined,
      aiAssistanceDisclosure: record.aiAssistanceDisclosure ?? undefined
    },
    createdBy: record.createdBy,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!
  };
};

const claimFromRecord = (record: any): Claim => ({
  id: record.id,
  type: "claim",
  manuscriptId: record.manuscriptId,
  text: record.text,
  claimType: record.claimType,
  strengthLevel: record.strengthLevel,
  status: record.status,
  authorApproved: record.authorApproved,
  publicationReady: record.publicationReady,
  linkedEvidence: (record.evidenceLinks ?? []).map((link: any) => ({
    evidenceId: link.evidenceId,
    status: link.status,
    confirmedBy: link.confirmedBy ?? undefined,
    confirmedAt: iso(link.confirmedAt)
  })),
  linkedLimitations: (record.limitationLinks ?? []).map((link: any) => ({ entityId: link.limitationId, status: link.status })),
  linkedCitations: (record.citationLinks ?? []).map((link: any) => ({ entityId: link.citationId, status: link.status })),
  linkedMethods: (record.methodLinks ?? []).map((link: any) => ({ entityId: link.methodBlockId, status: link.status })),
  sourceFigures: (record.figureLinks ?? []).map((link: any) => ({ entityId: link.figureId, status: link.status })),
  provenanceIds: [],
  reviewFlagIds: [],
  createdBy: record.createdBy,
  createdAt: iso(record.createdAt)!,
  updatedAt: iso(record.updatedAt)!
});

const evidenceFromRecord = (record: any): Evidence => ({
  id: record.id,
  type: "evidence",
  manuscriptId: record.manuscriptId,
  evidenceType: record.evidenceType,
  summary: record.summary,
  linkedAssetIds: (record.assetLinks ?? []).map((link: any) => link.assetId),
  linkedClaimIds: (record.claimLinks ?? []).map((link: any) => link.claimId),
  confidenceNotes: record.confidenceNotes ?? undefined,
  provenanceIds: [],
  createdBy: record.createdBy,
  createdAt: iso(record.createdAt)!,
  updatedAt: iso(record.updatedAt)!
});

const figureFromRecord = (record: any): Figure => ({
  id: record.id,
  type: "figure",
  manuscriptId: record.manuscriptId,
  figureNumber: record.figureNumber ?? undefined,
  title: record.title,
  caption: record.caption,
  panelStructure: record.panelStructure ?? undefined,
  uploadedAssetIds: [],
  rawDataLinkIds: [],
  linkedClaimIds: (record.claimLinks ?? []).map((link: any) => link.claimId),
  linkedEvidenceIds: [],
  linkedMethodBlockIds: [],
  status: record.status,
  createdBy: record.createdBy,
  createdAt: iso(record.createdAt)!,
  updatedAt: iso(record.updatedAt)!
});

const methodFromRecord = (record: any): MethodBlock => ({
  id: record.id,
  type: "method_block",
  manuscriptId: record.manuscriptId,
  title: record.title,
  content: record.content,
  protocolType: record.protocolType ?? undefined,
  linkedClaimIds: (record.claimLinks ?? []).map((link: any) => link.claimId),
  linkedFigureIds: [],
  reproducibilityNotes: record.reproducibilityNotes ?? undefined,
  status: record.status,
  createdBy: record.createdBy,
  createdAt: iso(record.createdAt)!,
  updatedAt: iso(record.updatedAt)!
});

const citationFromRecord = (record: any): Citation => ({
  id: record.id,
  type: "citation",
  manuscriptId: record.manuscriptId,
  citationKey: record.citationKey,
  doi: record.doi ?? undefined,
  title: record.title,
  authors: Array.isArray(record.authors) ? record.authors.filter((author): author is string => typeof author === "string") : [],
  journal: record.journal ?? undefined,
  year: record.year ?? undefined,
  volume: record.volume ?? undefined,
  issue: record.issue ?? undefined,
  pages: record.pages ?? undefined,
  url: record.url ?? undefined,
  linkedClaimIds: (record.claimLinks ?? []).map((link: any) => link.claimId),
  linkedSectionIds: [],
  createdBy: record.createdBy,
  createdAt: iso(record.createdAt)!,
  updatedAt: iso(record.updatedAt)!
});

const limitationFromRecord = (record: any): Limitation => ({
  id: record.id,
  type: "limitation",
  manuscriptId: record.manuscriptId,
  text: record.text,
  scope: record.scope ?? undefined,
  linkedClaimIds: (record.claimLinks ?? []).map((link: any) => link.claimId),
  severityOrImportance: record.severityOrImportance ?? undefined,
  status: record.status,
  createdBy: record.createdBy,
  createdAt: iso(record.createdAt)!,
  updatedAt: iso(record.updatedAt)!
});

const approvalFromRecord = (record: any): ApprovalEvent => ({
  id: record.id,
  type: "approval_event",
  manuscriptId: record.manuscriptId,
  approvalType: record.approvalType,
  actorType: record.actorType,
  actorId: record.actorId,
  sourceClassification: record.sourceClassification,
  targetEntityType: record.targetEntityType,
  targetEntityId: record.targetEntityId,
  targetVersionId: record.targetVersionId ?? undefined,
  targetSnapshotRef: record.targetSnapshotRef ?? undefined,
  approved: record.approved,
  notes: record.notes ?? undefined,
  createdAt: iso(record.createdAt)!
});

const reviewFromRecord = (record: any): AIReviewResult => ({
  id: record.id,
  type: "ai_review_result",
  manuscriptId: record.manuscriptId,
  ruleId: record.ruleId,
  severity: record.severity,
  message: record.message,
  linkedEntityIds: record.linkedEntityIds,
  recommendedAction: record.recommendedAction,
  resolutionStatus: record.resolutionStatus,
  modelActionType: record.modelActionType,
  createdAt: iso(record.createdAt)!
});

const validityAssessmentFromRecord = (record: any): ClaimValidityAssessment => ({
  assessmentId: record.id,
  type: "claim_validity_assessment",
  manuscriptId: record.manuscriptId,
  claimId: record.claimId,
  overallValidityScore: record.overallValidityScore,
  scoreBand: record.scoreBand,
  summaryForUser: record.summaryForUser,
  majorConcerns: Array.isArray(record.majorConcerns) ? record.majorConcerns : [],
  suggestedNextActions: Array.isArray(record.suggestedNextActions) ? record.suggestedNextActions : [],
  biggestScoreDrivers: Array.isArray(record.biggestScoreDrivers) ? record.biggestScoreDrivers : [],
  expandableDimensions: record.expandableDimensions as ClaimValidityAssessment["expandableDimensions"],
  modelConfidence: record.modelConfidence,
  generatedAt: iso(record.generatedAt)!,
  sourceMode: record.sourceMode,
  basedOnLinkedObjectIds: Array.isArray(record.basedOnLinkedObjectIds) ? record.basedOnLinkedObjectIds : [],
  basedOnSnapshotRef: record.basedOnSnapshotRef,
  basedOnSnapshot: (record.basedOnSnapshot ?? {}) as Record<string, unknown>,
  stale: false,
  freshnessStatus: "current",
  staleReasons: []
});

const authorFromRecord = (record: any): Author => ({
  id: record.id,
  type: "author",
  projectId: record.projectId,
  displayName: record.displayName,
  email: record.email ?? undefined,
  orcid: record.orcid ?? undefined
});

const projectMemberFromRecord = (record: any): ProjectMember => ({
  id: record.id,
  projectId: record.projectId,
  authorId: record.authorId,
  role: record.role,
  addedBy: record.addedBy ?? undefined,
  createdAt: iso(record.createdAt)!
});

const manuscriptMemberFromRecord = (record: any): ManuscriptMember => ({
  id: record.id,
  manuscriptId: record.manuscriptId,
  authorId: record.authorId,
  role: record.role,
  addedBy: record.addedBy ?? undefined,
  createdAt: iso(record.createdAt)!
});

const auditFromRecord = (record: any) => ({
  id: record.id,
  type: "audit_log" as const,
  projectId: record.projectId ?? undefined,
  manuscriptId: record.manuscriptId ?? undefined,
  actorType: record.actorType,
  actorId: record.actorId,
  sourceClassification: record.sourceClassification,
  action: record.action,
  targetEntityType: record.targetEntityType,
  targetEntityId: record.targetEntityId,
  targetVersionId: record.targetVersionId ?? undefined,
  targetSnapshotRef: record.targetSnapshotRef ?? undefined,
  beforeSnapshot: record.beforeSnapshot ?? undefined,
  afterSnapshot: record.afterSnapshot ?? undefined,
  context: record.context ?? undefined,
  createdAt: iso(record.createdAt)!
});

async function getActiveManuscriptId(manuscriptId?: string): Promise<string> {
  if (manuscriptId) return manuscriptId;
  const manuscript = await prisma.manuscript.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!manuscript) throw new Error("No manuscript exists yet. Create a manuscript first.");
  return manuscript.id;
}

function requireManuscriptId(manuscriptId: string | undefined, action: string): string {
  if (!manuscriptId) {
    throw new Error(`manuscriptId is required to ${action}.`);
  }

  return manuscriptId;
}

async function assertEntityIdsBelongToManuscript(input: {
  manuscriptId: string;
  ids: string[] | undefined;
  entityLabel: string;
  loadRecords: (ids: string[]) => Promise<Array<{ id: string; manuscriptId: string }>>;
}) {
  const uniqueIds = [...new Set((input.ids ?? []).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return;
  }

  const records = await input.loadRecords(uniqueIds);

  if (records.length !== uniqueIds.length || records.some((record) => record.manuscriptId !== input.manuscriptId)) {
    throw new Error(`All ${input.entityLabel} must belong to manuscript ${input.manuscriptId}.`);
  }
}

async function assertClaimIdsBelongToManuscript(manuscriptId: string, claimIds?: string[]) {
  await assertEntityIdsBelongToManuscript({
    manuscriptId,
    ids: claimIds,
    entityLabel: "linked claims",
    loadRecords: (ids) => prisma.claim.findMany({ where: { id: { in: ids } }, select: { id: true, manuscriptId: true } })
  });
}

async function assertEvidenceIdsBelongToManuscript(manuscriptId: string, evidenceIds?: string[]) {
  await assertEntityIdsBelongToManuscript({
    manuscriptId,
    ids: evidenceIds,
    entityLabel: "linked evidence",
    loadRecords: (ids) => prisma.evidence.findMany({ where: { id: { in: ids } }, select: { id: true, manuscriptId: true } })
  });
}

async function assertFigureIdsBelongToManuscript(manuscriptId: string, figureIds?: string[]) {
  await assertEntityIdsBelongToManuscript({
    manuscriptId,
    ids: figureIds,
    entityLabel: "linked figures",
    loadRecords: (ids) => prisma.figure.findMany({ where: { id: { in: ids } }, select: { id: true, manuscriptId: true } })
  });
}

async function assertMethodIdsBelongToManuscript(manuscriptId: string, methodIds?: string[]) {
  await assertEntityIdsBelongToManuscript({
    manuscriptId,
    ids: methodIds,
    entityLabel: "linked method blocks",
    loadRecords: (ids) =>
      prisma.methodBlock.findMany({ where: { id: { in: ids } }, select: { id: true, manuscriptId: true } })
  });
}

async function assertLimitationIdsBelongToManuscript(manuscriptId: string, limitationIds?: string[]) {
  await assertEntityIdsBelongToManuscript({
    manuscriptId,
    ids: limitationIds,
    entityLabel: "linked limitations",
    loadRecords: (ids) =>
      prisma.limitation.findMany({ where: { id: { in: ids } }, select: { id: true, manuscriptId: true } })
  });
}

async function assertCitationIdsBelongToManuscript(manuscriptId: string, citationIds?: string[]) {
  await assertEntityIdsBelongToManuscript({
    manuscriptId,
    ids: citationIds,
    entityLabel: "linked citations",
    loadRecords: (ids) => prisma.citation.findMany({ where: { id: { in: ids } }, select: { id: true, manuscriptId: true } })
  });
}

async function assertSectionObjectRefsBelongToManuscript(manuscriptId: string, objectRefs: SectionObjectRef[]) {
  await assertClaimIdsBelongToManuscript(
    manuscriptId,
    objectRefs.filter((ref) => ref.entityType === "claim").map((ref) => ref.entityId)
  );
  await assertFigureIdsBelongToManuscript(
    manuscriptId,
    objectRefs.filter((ref) => ref.entityType === "figure").map((ref) => ref.entityId)
  );
  await assertMethodIdsBelongToManuscript(
    manuscriptId,
    objectRefs.filter((ref) => ref.entityType === "method_block").map((ref) => ref.entityId)
  );
  await assertCitationIdsBelongToManuscript(
    manuscriptId,
    objectRefs.filter((ref) => ref.entityType === "citation").map((ref) => ref.entityId)
  );
  await assertLimitationIdsBelongToManuscript(
    manuscriptId,
    objectRefs.filter((ref) => ref.entityType === "limitation").map((ref) => ref.entityId)
  );
}

async function resolveAuthority(manuscriptId: string, actorId: string) {
  const manuscript = await prisma.manuscript.findUnique({
    where: { id: manuscriptId },
    select: { id: true, projectId: true }
  });
  if (!manuscript) throw new Error(`Manuscript ${manuscriptId} was not found.`);

  const [author, projectMember, manuscriptMember] = await Promise.all([
    prisma.author.findFirst({ where: { id: actorId, projectId: manuscript.projectId } }),
    prisma.projectMember.findUnique({ where: { projectId_authorId: { projectId: manuscript.projectId, authorId: actorId } } }),
    prisma.manuscriptMember.findUnique({ where: { manuscriptId_authorId: { manuscriptId, authorId: actorId } } })
  ]);

  if (!author) throw new Error("Approval actor must resolve to a known project author.");

  return {
    manuscript,
    actor: { id: author.id, type: "human_author" as const, displayName: author.displayName },
    authority: {
      isManuscriptAuthor: Boolean(manuscriptMember),
      isProjectOwner: projectMember?.role === "owner" || manuscriptMember?.role === "owner",
      isCorrespondingAuthor: manuscriptMember?.role === "corresponding_author"
    }
  };
}

async function writeAuditLog(input: {
  projectId?: string;
  manuscriptId?: string;
  actor: Actor;
  action: string;
  targetEntityType: string;
  targetEntityId: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
  sourceClassification?: "human" | "ai_suggestion" | "system";
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  context?: Record<string, unknown>;
}) {
  const entry = createAuditLogEntry({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...input
  });
  await prisma.auditLog.create({
    data: {
      projectId: entry.projectId,
      manuscriptId: entry.manuscriptId,
      actorType: entry.actorType,
      actorId: entry.actorId,
      sourceClassification: entry.sourceClassification,
      action: entry.action,
      targetEntityType: entry.targetEntityType,
      targetEntityId: entry.targetEntityId,
      targetVersionId: entry.targetVersionId,
      targetSnapshotRef: entry.targetSnapshotRef,
      beforeSnapshot: entry.beforeSnapshot as any,
      afterSnapshot: entry.afterSnapshot as any,
      context: entry.context as any
    }
  });
}

export async function listProjects(): Promise<Project[]> {
  return (await prisma.project.findMany({ orderBy: { createdAt: "desc" } })).map(projectFromRecord);
}

export async function resetDevelopmentQaData(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Project" RESTART IDENTITY CASCADE');
}

export async function createProject(input: { name: string; description?: string; createdBy?: string }): Promise<Project> {
  const record = await prisma.project.create({
    data: { name: input.name, description: input.description, createdBy: input.createdBy ?? SYSTEM_ACTOR.id }
  });
  await writeAuditLog({
    projectId: record.id,
    actor: actorFromId(input.createdBy),
    action: "project.created",
    targetEntityType: "project",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { name: record.name, description: record.description ?? undefined }
  });
  return projectFromRecord(record);
}

export async function createManuscript(input: ManuscriptInput): Promise<Manuscript> {
  const record = await prisma.manuscript.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      shortTitle: input.shortTitle,
      abstract: input.abstract,
      keywords: input.keywords ?? [],
      articleType: input.articleType ?? "research_article",
      createdBy: input.createdBy ?? SYSTEM_ACTOR.id
    }
  });
  await writeAuditLog({
    projectId: record.projectId,
    manuscriptId: record.id,
    actor: actorFromId(input.createdBy),
    action: "manuscript.created",
    targetEntityType: "manuscript",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { title: record.title, articleType: record.articleType ?? undefined }
  });
  return manuscriptFromRecord(record);
}

export async function listManuscripts(projectId?: string): Promise<Manuscript[]> {
  return (
    await prisma.manuscript.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" }
    })
  ).map(manuscriptFromRecord);
}

export async function getResearchObjectGraph(manuscriptId?: string): Promise<ResearchObjectGraph> {
  const id = await getActiveManuscriptId(manuscriptId);
  const manuscript = await prisma.manuscript.findUniqueOrThrow({
    where: { id },
    include: {
      project: { include: { members: true } },
      sections: { orderBy: { orderIndex: "asc" } },
      claims: { include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true } },
      evidence: { include: { claimLinks: true, assetLinks: true } },
      figures: { include: { claimLinks: true } },
      methodBlocks: { include: { claimLinks: true } },
      citations: { include: { claimLinks: true } },
      limitations: { include: { claimLinks: true } },
      authors: { include: { author: true } },
      members: true,
      approvalEvents: true,
      provenanceRecords: true,
      aiReviewResults: true,
      validityAssessments: { orderBy: { generatedAt: "desc" } },
      auditLogs: true,
      datasets: true,
      softwareArtifacts: true
    }
  });

  const baseGraph: ResearchObjectGraph = {
    manuscript: manuscriptFromRecord(manuscript),
    sections: manuscript.sections.map((section) => ({
      id: section.id,
      type: "section",
      manuscriptId: section.manuscriptId,
      title: section.title,
      orderIndex: section.orderIndex,
      objectRefs: section.objectRefs as SectionObjectRef[],
      status: section.status,
      createdBy: section.createdBy,
      createdAt: iso(section.createdAt)!,
      updatedAt: iso(section.updatedAt)!
    })),
    claims: manuscript.claims.map(claimFromRecord),
    evidence: manuscript.evidence.map(evidenceFromRecord),
    figures: manuscript.figures.map(figureFromRecord),
    methods: manuscript.methodBlocks.map(methodFromRecord),
    citations: manuscript.citations.map(citationFromRecord),
    limitations: manuscript.limitations.map(limitationFromRecord),
    approvals: manuscript.approvalEvents.map(approvalFromRecord),
    provenance: manuscript.provenanceRecords.map((record) => ({
      id: record.id,
      type: "provenance_record",
      manuscriptId: record.manuscriptId,
      targetEntityType: record.targetEntityType,
      targetEntityId: record.targetEntityId,
      sourceObjectIds: record.sourceObjectIds,
      modelActionType: record.modelActionType ?? undefined,
      preVersionId: record.preVersionId ?? undefined,
      postVersionId: record.postVersionId ?? undefined,
      authorApprovalStatus: record.authorApprovalStatus as any,
      createdAt: iso(record.createdAt)!
    })),
    auditLogs: manuscript.auditLogs.map(auditFromRecord),
    authors: manuscript.authors.map((item) => authorFromRecord(item.author)),
    projectMembers: manuscript.project.members.map(projectMemberFromRecord),
    manuscriptMembers: manuscript.members.map(manuscriptMemberFromRecord),
    aiReviewResults: manuscript.aiReviewResults.map(reviewFromRecord),
    validityAssessments: [],
    claimTrustReadiness: [],
    datasets: manuscript.datasets.map((dataset) => ({ id: dataset.id, title: dataset.title })),
    softwareArtifacts: manuscript.softwareArtifacts.map((artifact) => ({ id: artifact.id, name: artifact.name }))
  };

  const graphWithValidity = {
    ...baseGraph,
    validityAssessments: selectLatestClaimValidityAssessments({
      assessments: manuscript.validityAssessments.map(validityAssessmentFromRecord),
      graph: baseGraph
    })
  };

  return {
    ...graphWithValidity,
    claimTrustReadiness: graphWithValidity.claims.map((claim) => getClaimTrustReadiness(graphWithValidity, claim.id))
  };
}

async function getProjectGraphs(projectId?: string): Promise<ResearchObjectGraph[]> {
  const manuscripts = await listManuscripts(projectId);
  return Promise.all(manuscripts.map((manuscript) => getResearchObjectGraph(manuscript.id)));
}

export async function getProjectMemory(projectId?: string): Promise<ProjectMemorySummary> {
  const projects = projectId ? await prisma.project.findMany({ where: { id: projectId } }) : await prisma.project.findMany({ orderBy: { createdAt: "desc" }, take: 1 });
  const project = projects[0];

  if (!project) {
    throw new Error("No project exists yet. Create a project first.");
  }

  const graphs = await getProjectGraphs(project.id);
  return buildProjectMemorySummary({
    projectId: project.id,
    graphs
  });
}

export async function digestProjectMemory(projectId?: string): Promise<ProjectMemorySummary> {
  const projects = projectId ? await prisma.project.findMany({ where: { id: projectId } }) : await prisma.project.findMany({ orderBy: { createdAt: "desc" }, take: 1 });
  const project = projects[0];

  if (!project) {
    throw new Error("No project exists yet. Create a project first.");
  }

  const manuscripts = await listManuscripts(project.id);

  for (const manuscript of manuscripts) {
    await runReview(manuscript.id);
    const graph = await getResearchObjectGraph(manuscript.id);

    for (const claim of graph.claims) {
      await assessClaimValidity({ manuscriptId: manuscript.id, claimId: claim.id });
    }
  }

  return getProjectMemory(project.id);
}

export async function answerProjectDiscussion(input: {
  projectId?: string;
  question: string;
  claimIds?: string[];
}): Promise<GroundedDiscussionAnswer> {
  const memory = await getProjectMemory(input.projectId);
  return answerGroundedDiscussion({
    memory,
    question: input.question,
    claimIds: input.claimIds
  });
}

export async function listAuthors(projectId?: string): Promise<Author[]> {
  const activeProjectId = projectId ?? (await prisma.manuscript.findFirst({ orderBy: { createdAt: "desc" } }))?.projectId;
  return (
    await prisma.author.findMany({
      where: activeProjectId ? { projectId: activeProjectId } : undefined,
      orderBy: { displayName: "asc" }
    })
  ).map(authorFromRecord);
}

export async function getActorMembershipContext(actorId: string, manuscriptId?: string) {
  const author = await prisma.author.findUnique({
    where: { id: actorId }
  });

  if (!author) {
    throw new Error(`Author ${actorId} was not found.`);
  }

  const manuscript = manuscriptId
    ? await prisma.manuscript.findUnique({
        where: { id: manuscriptId },
        select: { id: true, projectId: true, title: true }
      })
    : null;

  const projectRole = (
    await prisma.projectMember.findUnique({
      where: {
        projectId_authorId: {
          projectId: manuscript?.projectId ?? author.projectId,
          authorId: actorId
        }
      }
    })
  )?.role;

  const manuscriptRole = manuscript
    ? (
        await prisma.manuscriptMember.findUnique({
          where: {
            manuscriptId_authorId: {
              manuscriptId: manuscript.id,
              authorId: actorId
            }
          }
        })
      )?.role
    : undefined;

  return {
    actor: authorFromRecord(author),
    manuscriptId: manuscript?.id,
    manuscriptTitle: manuscript?.title,
    projectRole: projectRole ?? null,
    manuscriptRole: manuscriptRole ?? null,
    allowedActions: {
      canApproveClaim: Boolean(manuscriptRole),
      canApproveClaimEvidence: Boolean(manuscriptRole),
      canConfirmFinalIntent:
        projectRole === "owner" || manuscriptRole === "owner" || manuscriptRole === "corresponding_author"
    }
  };
}

export async function seedDevelopmentQaScenario() {
  await resetDevelopmentQaData();

  const project = await createProject({
    name: "QA Seed Project",
    description: "Development-only seeded project for manual QA."
  });
  const manuscript = await createManuscript({
    projectId: project.id,
    title: "QA Seed Manuscript",
    abstract: "A seeded manuscript for manually testing authority, review, and export flows.",
    keywords: ["qa", "seed", "manual"]
  });
  const owner = await createAuthor({
    projectId: project.id,
    manuscriptId: manuscript.id,
    displayName: "Dr. Owner QA",
    email: "owner.qa@example.org",
    orcid: "0000-0001-1111-1111",
    memberRole: "owner"
  });
  const correspondingAuthor = await createAuthor({
    projectId: project.id,
    manuscriptId: manuscript.id,
    displayName: "Dr. Corresponding QA",
    email: "corresponding.qa@example.org",
    orcid: "0000-0002-2222-2222",
    memberRole: "corresponding_author",
    createdBy: owner.id
  });
  const coauthor = await createAuthor({
    projectId: project.id,
    manuscriptId: manuscript.id,
    displayName: "Dr. Coauthor QA",
    email: "coauthor.qa@example.org",
    orcid: "0000-0003-3333-3333",
    memberRole: "coauthor",
    createdBy: owner.id
  });
  const claim = await createClaim({
    manuscriptId: manuscript.id,
    text: "Treatment A causes marker B reduction in the study cohort.",
    claimType: "observation",
    strengthLevel: "moderate",
    createdBy: correspondingAuthor.id
  });
  const evidence = await createEvidence({
    manuscriptId: manuscript.id,
    evidenceType: "figure",
    summary: "Figure 1 shows marker B reduction after Treatment A.",
    linkedClaimIds: [claim.id],
    confidenceNotes: "Direction is clear but causal language should be reviewed.",
    createdBy: correspondingAuthor.id
  });
  const figure = await createFigure({
    manuscriptId: manuscript.id,
    figureNumber: "1",
    title: "Marker B response",
    caption: "Marker B decreases after Treatment A in the study cohort.",
    linkedClaimIds: [claim.id],
    linkedEvidenceIds: [evidence.id],
    createdBy: correspondingAuthor.id
  });
  const method = await createMethodBlock({
    manuscriptId: manuscript.id,
    title: "Marker B quantification",
    content:
      "Marker B was quantified from prepared cohort samples using a pre-specified assay protocol with batch controls, duplicate measurements, and blinded normalization before group-level comparison.",
    linkedClaimIds: [claim.id],
    linkedFigureIds: [figure.id],
    createdBy: correspondingAuthor.id
  });
  const limitation = await createLimitation({
    manuscriptId: manuscript.id,
    text: "The cohort size limits generalization beyond the sampled population.",
    linkedClaimIds: [claim.id],
    severityOrImportance: "moderate",
    createdBy: correspondingAuthor.id
  });
  const section = await createSection({
    manuscriptId: manuscript.id,
    title: "Results",
    objectRefs: [
      { entityType: "claim", entityId: claim.id, orderIndex: 1 },
      { entityType: "figure", entityId: figure.id, orderIndex: 2 },
      { entityType: "method_block", entityId: method.id, orderIndex: 3 },
      { entityType: "limitation", entityId: limitation.id, orderIndex: 4 }
    ],
    createdBy: correspondingAuthor.id
  });

  return {
    project,
    manuscript,
    owner,
    correspondingAuthor,
    coauthor,
    claim,
    evidence,
    figure,
    method,
    limitation,
    section
  };
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
  const manuscript = input.manuscriptId
    ? await prisma.manuscript.findUnique({ where: { id: input.manuscriptId }, select: { id: true, projectId: true } })
    : null;
  const projectId = input.projectId ?? manuscript?.projectId;
  if (!projectId) throw new Error("projectId or manuscriptId is required when creating an author.");
  if (input.projectId && manuscript && input.projectId !== manuscript.projectId) {
    throw new Error("Author projectId must match the manuscript project.");
  }

  const role = input.memberRole ?? "coauthor";
  const record = await prisma.$transaction(async (tx) => {
    const author = await tx.author.create({
      data: { projectId, displayName: input.displayName, email: input.email, orcid: input.orcid }
    });
    await tx.projectMember.create({
      data: { projectId, authorId: author.id, role: role === "owner" ? "owner" : "coauthor", addedBy: input.createdBy }
    });
    if (manuscript) {
      const orderIndex = await tx.manuscriptAuthor.count({ where: { manuscriptId: manuscript.id } });
      await tx.manuscriptMember.create({
        data: { manuscriptId: manuscript.id, authorId: author.id, role, addedBy: input.createdBy }
      });
      await tx.manuscriptAuthor.create({
        data: {
          manuscriptId: manuscript.id,
          authorId: author.id,
          contributorRoles: input.contributorRoles ?? ["author"],
          isCorrespondingAuthor: role === "corresponding_author",
          orderIndex: orderIndex + 1
        }
      });
    }
    return author;
  });

  await writeAuditLog({
    projectId: record.projectId,
    manuscriptId: manuscript?.id,
    actor: actorFromId(input.createdBy ?? record.id),
    action: "author.created",
    targetEntityType: "author",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { displayName: record.displayName, memberRole: manuscript ? role : undefined }
  });

  return authorFromRecord(record);
}

export async function listClaims(manuscriptId?: string): Promise<Claim[]> {
  const id = await getActiveManuscriptId(manuscriptId);
  return (
    await prisma.claim.findMany({
      where: { manuscriptId: id },
      include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true },
      orderBy: { createdAt: "desc" }
    })
  ).map(claimFromRecord);
}

export async function createClaim(input: {
  manuscriptId: string;
  text: string;
  claimType: ClaimType;
  strengthLevel: StrengthLevel;
  createdBy?: string;
}): Promise<Claim> {
  const manuscriptId = requireManuscriptId(input.manuscriptId, "create a claim");
  const record = await prisma.claim.create({
    data: {
      manuscriptId,
      text: input.text,
      claimType: input.claimType,
      strengthLevel: input.strengthLevel,
      createdBy: input.createdBy ?? SYSTEM_ACTOR.id
    },
    include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
  });
  await writeAuditLog({
    manuscriptId,
    actor: actorFromId(input.createdBy),
    action: "claim.created",
    targetEntityType: "claim",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { text: record.text, claimType: record.claimType, strengthLevel: record.strengthLevel }
  });
  return claimFromRecord(record);
}

export async function updateClaim(input: {
  claimId: string;
  text: string;
  claimType: ClaimType;
  strengthLevel: StrengthLevel;
  updatedBy?: string;
}): Promise<Claim> {
  const existing = await prisma.claim.findUniqueOrThrow({
    where: { id: input.claimId },
    include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
  });

  const record = await prisma.claim.update({
    where: { id: input.claimId },
    data: {
      text: input.text,
      claimType: input.claimType,
      strengthLevel: input.strengthLevel
    },
    include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
  });

  await writeAuditLog({
    manuscriptId: record.manuscriptId,
    actor: actorFromId(input.updatedBy),
    action: "claim.updated",
    targetEntityType: "claim",
    targetEntityId: record.id,
    sourceClassification: input.updatedBy ? "human" : "system",
    beforeSnapshot: {
      text: existing.text,
      claimType: existing.claimType,
      strengthLevel: existing.strengthLevel
    },
    afterSnapshot: {
      text: record.text,
      claimType: record.claimType,
      strengthLevel: record.strengthLevel
    }
  });

  return claimFromRecord(record);
}

export async function createEvidence(input: {
  manuscriptId: string;
  evidenceType: Evidence["evidenceType"];
  summary: string;
  linkedClaimIds?: string[];
  confidenceNotes?: string;
  createdBy?: string;
}): Promise<Evidence> {
  const manuscriptId = requireManuscriptId(input.manuscriptId, "create evidence");
  await assertClaimIdsBelongToManuscript(manuscriptId, input.linkedClaimIds);
  const record = await prisma.evidence.create({
    data: {
      manuscriptId,
      evidenceType: input.evidenceType,
      summary: input.summary,
      confidenceNotes: input.confidenceNotes,
      createdBy: input.createdBy ?? SYSTEM_ACTOR.id,
      claimLinks: { create: (input.linkedClaimIds ?? []).map((claimId) => ({ claimId, status: "proposed" })) }
    },
    include: { claimLinks: true, assetLinks: true }
  });
  await writeAuditLog({
    manuscriptId,
    actor: actorFromId(input.createdBy),
    action: "evidence.created",
    targetEntityType: "evidence",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { evidenceType: record.evidenceType, linkedClaimIds: input.linkedClaimIds ?? [] }
  });
  return evidenceFromRecord(record);
}

export async function updateEvidence(input: {
  evidenceId: string;
  evidenceType: Evidence["evidenceType"];
  summary: string;
  confidenceNotes?: string;
  updatedBy?: string;
}): Promise<Evidence> {
  const existing = await prisma.evidence.findUniqueOrThrow({
    where: { id: input.evidenceId },
    include: { claimLinks: true, assetLinks: true }
  });

  const record = await prisma.evidence.update({
    where: { id: input.evidenceId },
    data: {
      evidenceType: input.evidenceType,
      summary: input.summary,
      confidenceNotes: input.confidenceNotes
    },
    include: { claimLinks: true, assetLinks: true }
  });

  await writeAuditLog({
    manuscriptId: record.manuscriptId,
    actor: actorFromId(input.updatedBy),
    action: "evidence.updated",
    targetEntityType: "evidence",
    targetEntityId: record.id,
    sourceClassification: input.updatedBy ? "human" : "system",
    beforeSnapshot: {
      evidenceType: existing.evidenceType,
      summary: existing.summary,
      confidenceNotes: existing.confidenceNotes ?? undefined
    },
    afterSnapshot: {
      evidenceType: record.evidenceType,
      summary: record.summary,
      confidenceNotes: record.confidenceNotes ?? undefined
    }
  });

  return evidenceFromRecord(record);
}

export async function listEvidence(manuscriptId?: string): Promise<Evidence[]> {
  const id = await getActiveManuscriptId(manuscriptId);
  return (
    await prisma.evidence.findMany({
      where: { manuscriptId: id },
      include: { claimLinks: true, assetLinks: true },
      orderBy: { createdAt: "desc" }
    })
  ).map(evidenceFromRecord);
}

export async function createFigure(input: {
  manuscriptId: string;
  title: string;
  caption: string;
  figureNumber?: string;
  linkedClaimIds?: string[];
  linkedEvidenceIds?: string[];
  createdBy?: string;
}): Promise<Figure> {
  const manuscriptId = requireManuscriptId(input.manuscriptId, "create a figure");
  await Promise.all([
    assertClaimIdsBelongToManuscript(manuscriptId, input.linkedClaimIds),
    assertEvidenceIdsBelongToManuscript(manuscriptId, input.linkedEvidenceIds)
  ]);
  const record = await prisma.figure.create({
    data: {
      manuscriptId,
      title: input.title,
      caption: input.caption,
      figureNumber: input.figureNumber,
      createdBy: input.createdBy ?? SYSTEM_ACTOR.id,
      claimLinks: { create: (input.linkedClaimIds ?? []).map((claimId) => ({ claimId, status: "proposed" })) }
    },
    include: { claimLinks: true }
  });
  await writeAuditLog({
    manuscriptId,
    actor: actorFromId(input.createdBy),
    action: "figure.created",
    targetEntityType: "figure",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { figureNumber: record.figureNumber ?? undefined, linkedClaimIds: input.linkedClaimIds ?? [] }
  });
  return figureFromRecord(record);
}

export async function listFigures(manuscriptId?: string): Promise<Figure[]> {
  const id = await getActiveManuscriptId(manuscriptId);
  return (
    await prisma.figure.findMany({
      where: { manuscriptId: id },
      include: { claimLinks: true },
      orderBy: { createdAt: "desc" }
    })
  ).map(figureFromRecord);
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
  const manuscriptId = requireManuscriptId(input.manuscriptId, "create a method block");
  await Promise.all([
    assertClaimIdsBelongToManuscript(manuscriptId, input.linkedClaimIds),
    assertFigureIdsBelongToManuscript(manuscriptId, input.linkedFigureIds)
  ]);
  const record = await prisma.methodBlock.create({
    data: {
      manuscriptId,
      title: input.title,
      content: input.content,
      protocolType: input.protocolType,
      reproducibilityNotes: input.reproducibilityNotes,
      createdBy: input.createdBy ?? SYSTEM_ACTOR.id,
      claimLinks: {
        create: (input.linkedClaimIds ?? []).map((claimId) => ({ claimId, status: "proposed" }))
      }
    },
    include: { claimLinks: true }
  });
  await writeAuditLog({
    manuscriptId,
    actor: actorFromId(input.createdBy),
    action: "method_block.created",
    targetEntityType: "method_block",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { linkedClaimIds: input.linkedClaimIds ?? [], linkStatus: "proposed" }
  });
  return methodFromRecord(record);
}

export async function listMethods(manuscriptId?: string): Promise<MethodBlock[]> {
  const id = await getActiveManuscriptId(manuscriptId);
  return (
    await prisma.methodBlock.findMany({
      where: { manuscriptId: id },
      include: { claimLinks: true },
      orderBy: { createdAt: "desc" }
    })
  ).map(methodFromRecord);
}

export async function createLimitation(input: {
  manuscriptId: string;
  text: string;
  scope?: string;
  linkedClaimIds?: string[];
  severityOrImportance?: string;
  createdBy?: string;
}): Promise<Limitation> {
  const manuscriptId = requireManuscriptId(input.manuscriptId, "create a limitation");
  await assertClaimIdsBelongToManuscript(manuscriptId, input.linkedClaimIds);
  const record = await prisma.limitation.create({
    data: {
      manuscriptId,
      text: input.text,
      scope: input.scope,
      severityOrImportance: input.severityOrImportance,
      createdBy: input.createdBy ?? SYSTEM_ACTOR.id,
      claimLinks: {
        create: (input.linkedClaimIds ?? []).map((claimId) => ({ claimId, status: "proposed" }))
      }
    },
    include: { claimLinks: true }
  });
  await writeAuditLog({
    manuscriptId,
    actor: actorFromId(input.createdBy),
    action: "limitation.created",
    targetEntityType: "limitation",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { linkedClaimIds: input.linkedClaimIds ?? [], linkStatus: "proposed" }
  });
  return limitationFromRecord(record);
}

export async function listLimitations(manuscriptId?: string): Promise<Limitation[]> {
  const id = await getActiveManuscriptId(manuscriptId);
  return (
    await prisma.limitation.findMany({
      where: { manuscriptId: id },
      include: { claimLinks: true },
      orderBy: { createdAt: "desc" }
    })
  ).map(limitationFromRecord);
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
  const manuscriptId = requireManuscriptId(input.manuscriptId, "create a citation");
  await assertClaimIdsBelongToManuscript(manuscriptId, input.linkedClaimIds);
  const claimLinkConfirmation = await getClaimLinkConfirmation(manuscriptId, input.createdBy);
  const record = await prisma.citation.create({
    data: {
      manuscriptId,
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
      createdBy: input.createdBy ?? SYSTEM_ACTOR.id,
      claimLinks: {
        create: (input.linkedClaimIds ?? []).map((claimId) => ({
          claimId,
          status: claimLinkConfirmation.status,
          confirmedBy: claimLinkConfirmation.status === "confirmed" ? claimLinkConfirmation.confirmedBy : undefined,
          confirmedAt: claimLinkConfirmation.status === "confirmed" ? claimLinkConfirmation.confirmedAt : undefined
        }))
      }
    },
    include: { claimLinks: true }
  });

  await writeAuditLog({
    manuscriptId,
    actor: actorFromId(input.createdBy),
    action: "citation.created",
    targetEntityType: "citation",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { title: record.title, citationKey: record.citationKey, linkedClaimCount: input.linkedClaimIds?.length ?? 0 }
  });

  return citationFromRecord(record);
}

export async function listCitations(manuscriptId?: string): Promise<Citation[]> {
  const id = await getActiveManuscriptId(manuscriptId);
  return (
    await prisma.citation.findMany({
      where: { manuscriptId: id },
      include: { claimLinks: true },
      orderBy: { createdAt: "desc" }
    })
  ).map(citationFromRecord);
}

export async function approveClaim(
  claimId: string,
  actorId: string,
  options?: { notes?: string; targetVersionId?: string; targetSnapshotRef?: string }
): Promise<{ claim: Claim; approvalEvent: ApprovalEvent }> {
  const claim = await prisma.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
  });
  const approvalContext = await resolveAuthority(claim.manuscriptId, actorId);
  assertCanApproveClaimAuthority({ actor: approvalContext.actor, authority: approvalContext.authority });
  const currentGraph = await getResearchObjectGraph(claim.manuscriptId);
  const targetSnapshotRef = options?.targetSnapshotRef ?? createCurrentClaimTrustSnapshotRef(currentGraph, claim.id);

  const domainResult = applyClaimApproval({
    claim: claimFromRecord(claim),
    actor: approvalContext.actor,
    authority: approvalContext.authority,
    approvalEventId: `approval_${Date.now()}`,
    notes: options?.notes
  });

  const [updatedClaim, persistedApproval] = await prisma.$transaction([
    prisma.claim.update({
      where: { id: claim.id },
      data: { status: domainResult.claim.status, authorApproved: domainResult.claim.authorApproved },
      include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
    }),
    prisma.approvalEvent.create({
      data: {
        manuscriptId: domainResult.approvalEvent.manuscriptId,
        approvalType: domainResult.approvalEvent.approvalType,
        actorType: domainResult.approvalEvent.actorType,
        actorId: domainResult.approvalEvent.actorId,
        sourceClassification: domainResult.approvalEvent.sourceClassification,
        targetEntityType: domainResult.approvalEvent.targetEntityType,
        targetEntityId: domainResult.approvalEvent.targetEntityId,
        targetVersionId: options?.targetVersionId,
        targetSnapshotRef,
        approved: domainResult.approvalEvent.approved,
        notes: domainResult.approvalEvent.notes
      }
    })
  ]);

  await writeAuditLog({
    manuscriptId: claim.manuscriptId,
    projectId: approvalContext.manuscript.projectId,
    actor: approvalContext.actor,
    action: "approval.claim",
    targetEntityType: "claim",
    targetEntityId: claim.id,
    targetVersionId: options?.targetVersionId,
    targetSnapshotRef,
    sourceClassification: "human",
    beforeSnapshot: { status: claim.status, authorApproved: claim.authorApproved },
    afterSnapshot: { status: updatedClaim.status, authorApproved: updatedClaim.authorApproved }
  });

  return { claim: claimFromRecord(updatedClaim), approvalEvent: approvalFromRecord(persistedApproval) };
}

export async function approveClaimEvidenceLink(input: {
  claimId: string;
  evidenceId: string;
  actorId: string;
  notes?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
}): Promise<{ claim: Claim; approvalEvent: ApprovalEvent }> {
  const claim = await prisma.claim.findUniqueOrThrow({ where: { id: input.claimId } });
  const evidence = await prisma.evidence.findUniqueOrThrow({
    where: { id: input.evidenceId },
    select: { id: true, manuscriptId: true }
  });

  if (evidence.manuscriptId !== claim.manuscriptId) {
    throw new Error("Claim-evidence approval requires both objects to belong to the same manuscript.");
  }

  const approvalContext = await resolveAuthority(claim.manuscriptId, input.actorId);
  assertCanApproveClaimEvidenceAuthority({ actor: approvalContext.actor, authority: approvalContext.authority });

  const previousLink = await prisma.claimEvidenceLink.findUnique({
    where: { claimId_evidenceId: { claimId: input.claimId, evidenceId: input.evidenceId } }
  });

  const link = await prisma.claimEvidenceLink.upsert({
    where: { claimId_evidenceId: { claimId: input.claimId, evidenceId: input.evidenceId } },
    create: {
      claimId: input.claimId,
      evidenceId: input.evidenceId,
      status: "confirmed",
      confirmedBy: approvalContext.actor.id,
      confirmedAt: new Date()
    },
    update: {
      status: "confirmed",
      confirmedBy: approvalContext.actor.id,
      confirmedAt: new Date()
    }
  });

  const updatedGraph = await getResearchObjectGraph(claim.manuscriptId);
  const targetSnapshotRef = input.targetSnapshotRef ?? createCurrentClaimTrustSnapshotRef(updatedGraph, input.claimId);
  const approvalEvent = createApprovalEvent({
    id: `approval_${Date.now()}`,
    manuscriptId: claim.manuscriptId,
    approvalType: "claim_evidence_approval",
    actor: approvalContext.actor,
    sourceClassification: "human",
    targetEntityType: "claim_evidence_link",
    targetEntityId: `${input.claimId}:${input.evidenceId}`,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef,
    approved: true,
    notes: input.notes ?? "Author confirmed this claim-evidence linkage."
  });

  const persistedApproval = await prisma.approvalEvent.create({
    data: {
      manuscriptId: approvalEvent.manuscriptId,
      approvalType: approvalEvent.approvalType,
      actorType: approvalEvent.actorType,
      actorId: approvalEvent.actorId,
      sourceClassification: approvalEvent.sourceClassification,
      targetEntityType: approvalEvent.targetEntityType,
      targetEntityId: approvalEvent.targetEntityId,
      targetVersionId: approvalEvent.targetVersionId,
      targetSnapshotRef: approvalEvent.targetSnapshotRef,
      approved: approvalEvent.approved,
      notes: approvalEvent.notes
    }
  });

  await writeAuditLog({
    manuscriptId: claim.manuscriptId,
    projectId: approvalContext.manuscript.projectId,
    actor: approvalContext.actor,
    action: "approval.claim_evidence_link",
    targetEntityType: "claim_evidence_link",
    targetEntityId: `${input.claimId}:${input.evidenceId}`,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef,
    sourceClassification: "human",
    beforeSnapshot: previousLink
      ? { status: previousLink.status, confirmedBy: previousLink.confirmedBy ?? undefined }
      : undefined,
    afterSnapshot: { status: link.status, confirmedBy: link.confirmedBy ?? undefined }
  });

  const updatedClaim = await prisma.claim.findUniqueOrThrow({
    where: { id: input.claimId },
    include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
  });

  return { claim: claimFromRecord(updatedClaim), approvalEvent: approvalFromRecord(persistedApproval) };
}

export async function approveClaimMethodLink(input: {
  claimId: string;
  methodBlockId: string;
  actorId: string;
  notes?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
}): Promise<{ claim: Claim; approvalEvent: ApprovalEvent }> {
  const claim = await prisma.claim.findUniqueOrThrow({ where: { id: input.claimId } });
  const methodBlock = await prisma.methodBlock.findUniqueOrThrow({
    where: { id: input.methodBlockId },
    select: { id: true, manuscriptId: true }
  });

  if (methodBlock.manuscriptId !== claim.manuscriptId) {
    throw new Error("Claim-method approval requires both objects to belong to the same manuscript.");
  }

  const approvalContext = await resolveAuthority(claim.manuscriptId, input.actorId);
  assertCanApproveClaimMethodAuthority({ actor: approvalContext.actor, authority: approvalContext.authority });

  const previousLink = await prisma.claimMethodLink.findUnique({
    where: { claimId_methodBlockId: { claimId: input.claimId, methodBlockId: input.methodBlockId } }
  });

  const link = await prisma.claimMethodLink.upsert({
    where: { claimId_methodBlockId: { claimId: input.claimId, methodBlockId: input.methodBlockId } },
    create: {
      claimId: input.claimId,
      methodBlockId: input.methodBlockId,
      status: "confirmed",
      confirmedBy: approvalContext.actor.id,
      confirmedAt: new Date()
    },
    update: {
      status: "confirmed",
      confirmedBy: approvalContext.actor.id,
      confirmedAt: new Date()
    }
  });

  const updatedGraph = await getResearchObjectGraph(claim.manuscriptId);
  const targetSnapshotRef = input.targetSnapshotRef ?? createCurrentClaimTrustSnapshotRef(updatedGraph, input.claimId);
  const approvalEvent = createApprovalEvent({
    id: `approval_${Date.now()}`,
    manuscriptId: claim.manuscriptId,
    approvalType: "claim_method_approval",
    actor: approvalContext.actor,
    sourceClassification: "human",
    targetEntityType: "claim_method_link",
    targetEntityId: `${input.claimId}:${input.methodBlockId}`,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef,
    approved: true,
    notes: input.notes ?? "Author confirmed this claim-method linkage."
  });

  const persistedApproval = await prisma.approvalEvent.create({
    data: {
      manuscriptId: approvalEvent.manuscriptId,
      approvalType: approvalEvent.approvalType,
      actorType: approvalEvent.actorType,
      actorId: approvalEvent.actorId,
      sourceClassification: approvalEvent.sourceClassification,
      targetEntityType: approvalEvent.targetEntityType,
      targetEntityId: approvalEvent.targetEntityId,
      targetVersionId: approvalEvent.targetVersionId,
      targetSnapshotRef: approvalEvent.targetSnapshotRef,
      approved: approvalEvent.approved,
      notes: approvalEvent.notes
    }
  });

  await writeAuditLog({
    manuscriptId: claim.manuscriptId,
    projectId: approvalContext.manuscript.projectId,
    actor: approvalContext.actor,
    action: "approval.claim_method_link",
    targetEntityType: "claim_method_link",
    targetEntityId: `${input.claimId}:${input.methodBlockId}`,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef,
    sourceClassification: "human",
    beforeSnapshot: previousLink
      ? { status: previousLink.status, confirmedBy: previousLink.confirmedBy ?? undefined }
      : undefined,
    afterSnapshot: { status: link.status, confirmedBy: link.confirmedBy ?? undefined }
  });

  const updatedClaim = await prisma.claim.findUniqueOrThrow({
    where: { id: input.claimId },
    include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
  });

  return { claim: claimFromRecord(updatedClaim), approvalEvent: approvalFromRecord(persistedApproval) };
}

export async function approveClaimLimitationLink(input: {
  claimId: string;
  limitationId: string;
  actorId: string;
  notes?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
}): Promise<{ claim: Claim; approvalEvent: ApprovalEvent }> {
  const claim = await prisma.claim.findUniqueOrThrow({ where: { id: input.claimId } });
  const limitation = await prisma.limitation.findUniqueOrThrow({
    where: { id: input.limitationId },
    select: { id: true, manuscriptId: true }
  });

  if (limitation.manuscriptId !== claim.manuscriptId) {
    throw new Error("Claim-limitation approval requires both objects to belong to the same manuscript.");
  }

  const approvalContext = await resolveAuthority(claim.manuscriptId, input.actorId);
  assertCanApproveClaimLimitationAuthority({ actor: approvalContext.actor, authority: approvalContext.authority });

  const previousLink = await prisma.claimLimitationLink.findUnique({
    where: { claimId_limitationId: { claimId: input.claimId, limitationId: input.limitationId } }
  });

  const link = await prisma.claimLimitationLink.upsert({
    where: { claimId_limitationId: { claimId: input.claimId, limitationId: input.limitationId } },
    create: {
      claimId: input.claimId,
      limitationId: input.limitationId,
      status: "confirmed",
      confirmedBy: approvalContext.actor.id,
      confirmedAt: new Date()
    },
    update: {
      status: "confirmed",
      confirmedBy: approvalContext.actor.id,
      confirmedAt: new Date()
    }
  });

  const updatedGraph = await getResearchObjectGraph(claim.manuscriptId);
  const targetSnapshotRef = input.targetSnapshotRef ?? createCurrentClaimTrustSnapshotRef(updatedGraph, input.claimId);
  const approvalEvent = createApprovalEvent({
    id: `approval_${Date.now()}`,
    manuscriptId: claim.manuscriptId,
    approvalType: "claim_limitation_approval",
    actor: approvalContext.actor,
    sourceClassification: "human",
    targetEntityType: "claim_limitation_link",
    targetEntityId: `${input.claimId}:${input.limitationId}`,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef,
    approved: true,
    notes: input.notes ?? "Author confirmed this claim-limitation linkage."
  });

  const persistedApproval = await prisma.approvalEvent.create({
    data: {
      manuscriptId: approvalEvent.manuscriptId,
      approvalType: approvalEvent.approvalType,
      actorType: approvalEvent.actorType,
      actorId: approvalEvent.actorId,
      sourceClassification: approvalEvent.sourceClassification,
      targetEntityType: approvalEvent.targetEntityType,
      targetEntityId: approvalEvent.targetEntityId,
      targetVersionId: approvalEvent.targetVersionId,
      targetSnapshotRef: approvalEvent.targetSnapshotRef,
      approved: approvalEvent.approved,
      notes: approvalEvent.notes
    }
  });

  await writeAuditLog({
    manuscriptId: claim.manuscriptId,
    projectId: approvalContext.manuscript.projectId,
    actor: approvalContext.actor,
    action: "approval.claim_limitation_link",
    targetEntityType: "claim_limitation_link",
    targetEntityId: `${input.claimId}:${input.limitationId}`,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef,
    sourceClassification: "human",
    beforeSnapshot: previousLink
      ? { status: previousLink.status, confirmedBy: previousLink.confirmedBy ?? undefined }
      : undefined,
    afterSnapshot: { status: link.status, confirmedBy: link.confirmedBy ?? undefined }
  });

  const updatedClaim = await prisma.claim.findUniqueOrThrow({
    where: { id: input.claimId },
    include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
  });

  return { claim: claimFromRecord(updatedClaim), approvalEvent: approvalFromRecord(persistedApproval) };
}

export async function markClaimPublicationReady(claimId: string, actorId: string): Promise<Claim> {
  const claimRecord = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
  const approvalContext = await resolveAuthority(claimRecord.manuscriptId, actorId);
  assertCanApproveClaimAuthority({ actor: approvalContext.actor, authority: approvalContext.authority });

  const graph = await getResearchObjectGraph(claimRecord.manuscriptId);
  const claim = graph.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Claim ${claimId} was not found.`);
  const trust = getClaimTrustReadiness(graph, claimId);
  if (!trust.publicationReadiness.ready) {
    throw new Error(trust.publicationReadiness.reasons.join(" "));
  }

  const record = await prisma.claim.update({
    where: { id: claimId },
    data: { status: "publication_ready", publicationReady: true },
    include: { evidenceLinks: true, figureLinks: true, methodLinks: true, citationLinks: true, limitationLinks: true }
  });
  await writeAuditLog({
    manuscriptId: record.manuscriptId,
    projectId: approvalContext.manuscript.projectId,
    actor: approvalContext.actor,
    action: "claim.publication_ready_marked",
    targetEntityType: "claim",
    targetEntityId: record.id,
    targetSnapshotRef: trust.basedOnSnapshotRef,
    sourceClassification: "human",
    afterSnapshot: { status: record.status, publicationReady: record.publicationReady }
  });
  return claimFromRecord(record);
}

export async function createSection(input: {
  manuscriptId: string;
  title: string;
  objectRefs: SectionObjectRef[];
  createdBy?: string;
}): Promise<Section> {
  const manuscriptId = requireManuscriptId(input.manuscriptId, "create a section");
  await assertSectionObjectRefsBelongToManuscript(manuscriptId, input.objectRefs);
  const orderIndex = (await prisma.section.count({ where: { manuscriptId } })) + 1;
  const record = await prisma.section.create({
    data: {
      manuscriptId,
      title: input.title,
      orderIndex,
      objectRefs: input.objectRefs,
      createdBy: input.createdBy ?? SYSTEM_ACTOR.id
    }
  });
  await writeAuditLog({
    manuscriptId,
    actor: actorFromId(input.createdBy),
    action: "section.created",
    targetEntityType: "section",
    targetEntityId: record.id,
    sourceClassification: input.createdBy ? "human" : "system",
    afterSnapshot: { title: record.title, objectRefCount: input.objectRefs.length }
  });
  return {
    id: record.id,
    type: "section",
    manuscriptId: record.manuscriptId,
    title: record.title,
    orderIndex: record.orderIndex,
    objectRefs: record.objectRefs as SectionObjectRef[],
    status: record.status,
    createdBy: record.createdBy,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!
  };
}

export async function updateClaimSectionPlacement(input: {
  manuscriptId: string;
  claimId: string;
  sectionId?: string;
  sectionTitle?: string;
  updatedBy?: string;
}): Promise<Section> {
  const manuscriptId = requireManuscriptId(input.manuscriptId, "update claim section placement");
  await assertClaimIdsBelongToManuscript(manuscriptId, [input.claimId]);
  const sections = await prisma.section.findMany({
    where: { manuscriptId },
    orderBy: { orderIndex: "asc" }
  });

  const targetSection =
    input.sectionId
      ? sections.find((section) => section.id === input.sectionId)
      : sections.find((section) => section.title.toLowerCase() === input.sectionTitle?.toLowerCase());

  for (const section of sections) {
    const currentRefs = (section.objectRefs as SectionObjectRef[]).filter(
      (ref) => !(ref.entityType === "claim" && ref.entityId === input.claimId)
    );

    if (currentRefs.length !== (section.objectRefs as SectionObjectRef[]).length) {
      await prisma.section.update({
        where: { id: section.id },
        data: { objectRefs: currentRefs }
      });
    }
  }

  let finalSectionRecord;

  if (targetSection) {
    const existingRefs = (targetSection.objectRefs as SectionObjectRef[]).filter(Boolean);
    const alreadyPresent = existingRefs.some((ref) => ref.entityType === "claim" && ref.entityId === input.claimId);
    const nextRefs = alreadyPresent
      ? existingRefs
      : [
          ...existingRefs,
          {
            entityType: "claim",
            entityId: input.claimId,
            orderIndex: existingRefs.length
          }
        ];

    finalSectionRecord = await prisma.section.update({
      where: { id: targetSection.id },
      data: { objectRefs: nextRefs }
    });
  } else {
    const orderIndex = sections.length + 1;
    finalSectionRecord = await prisma.section.create({
      data: {
        manuscriptId,
        title: input.sectionTitle ?? "Results",
        orderIndex,
        objectRefs: [
          {
            entityType: "claim",
            entityId: input.claimId,
            orderIndex: 0
          }
        ],
        createdBy: input.updatedBy ?? SYSTEM_ACTOR.id
      }
    });
  }

  await writeAuditLog({
    manuscriptId,
    actor: actorFromId(input.updatedBy),
    action: "section.claim_placement_updated",
    targetEntityType: "section",
    targetEntityId: finalSectionRecord.id,
    sourceClassification: input.updatedBy ? "human" : "system",
    afterSnapshot: {
      claimId: input.claimId,
      sectionId: finalSectionRecord.id,
      title: finalSectionRecord.title
    }
  });

  return {
    id: finalSectionRecord.id,
    type: "section",
    manuscriptId: finalSectionRecord.manuscriptId,
    title: finalSectionRecord.title,
    orderIndex: finalSectionRecord.orderIndex,
    objectRefs: finalSectionRecord.objectRefs as SectionObjectRef[],
    status: finalSectionRecord.status,
    createdBy: finalSectionRecord.createdBy,
    createdAt: iso(finalSectionRecord.createdAt)!,
    updatedAt: iso(finalSectionRecord.updatedAt)!,
    versionId: undefined
  };
}

export async function runReview(manuscriptId?: string): Promise<AIReviewResult[]> {
  const graph = await getResearchObjectGraph(manuscriptId);
  const results = runDeterministicAiReview(graph);
  await prisma.$transaction(async (tx) => {
    await tx.aIReviewResult.deleteMany({
      where: { manuscriptId: graph.manuscript.id, modelActionType: "deterministic_rule_check" }
    });
    if (results.length > 0) {
      await tx.aIReviewResult.createMany({
        data: results.map((result) => ({
          manuscriptId: result.manuscriptId,
          ruleId: result.ruleId,
          severity: result.severity,
          message: result.message,
          linkedEntityIds: result.linkedEntityIds,
          recommendedAction: result.recommendedAction,
          resolutionStatus: result.resolutionStatus,
          modelActionType: result.modelActionType
        }))
      });
    }
  });
  await writeAuditLog({
    manuscriptId: graph.manuscript.id,
    projectId: graph.manuscript.projectId,
    actor: AI_REVIEW_ACTOR,
    action: "ai_review.completed",
    targetEntityType: "manuscript",
    targetEntityId: graph.manuscript.id,
    sourceClassification: "ai_suggestion",
    context: { resultCount: results.length, ruleIds: results.map((result) => result.ruleId) }
  });
  return (await prisma.aIReviewResult.findMany({ where: { manuscriptId: graph.manuscript.id } })).map(reviewFromRecord);
}

export async function listLatestClaimValidityAssessments(input?: {
  manuscriptId?: string;
  claimId?: string;
}): Promise<ClaimValidityAssessment[]> {
  const graph = await getResearchObjectGraph(input?.manuscriptId);
  const assessments = graph.validityAssessments ?? [];
  return input?.claimId ? assessments.filter((assessment) => assessment.claimId === input.claimId) : assessments;
}

export async function getClaimTrustContracts(manuscriptId?: string): Promise<ClaimTrustReadiness[]> {
  const graph = await getResearchObjectGraph(manuscriptId);
  return graph.claimTrustReadiness ?? [];
}

export async function getManuscriptTrustContract(manuscriptId?: string) {
  const graph = await getResearchObjectGraph(manuscriptId);
  return getManuscriptTrustReadiness(graph);
}

export async function assessClaimValidity(input: {
  manuscriptId?: string;
  claimId: string;
}): Promise<ClaimValidityAssessment> {
  const graph = await getResearchObjectGraph(input.manuscriptId);
  const assessment = buildClaimValidityAssessment({
    graph,
    claimId: input.claimId,
    assessmentId: `validity_${Date.now()}`,
    now: new Date().toISOString()
  });

  const persisted = await prisma.claimValidityAssessment.create({
    data: {
      manuscriptId: assessment.manuscriptId,
      claimId: assessment.claimId,
      overallValidityScore: assessment.overallValidityScore,
      scoreBand: assessment.scoreBand,
      summaryForUser: assessment.summaryForUser,
      majorConcerns: assessment.majorConcerns,
      suggestedNextActions: assessment.suggestedNextActions,
      biggestScoreDrivers: assessment.biggestScoreDrivers,
      expandableDimensions: assessment.expandableDimensions as any,
      modelConfidence: assessment.modelConfidence,
      sourceMode: assessment.sourceMode,
      basedOnLinkedObjectIds: assessment.basedOnLinkedObjectIds,
      basedOnSnapshotRef: assessment.basedOnSnapshotRef,
      basedOnSnapshot: assessment.basedOnSnapshot as any
    }
  });

  await writeAuditLog({
    manuscriptId: assessment.manuscriptId,
    projectId: graph.manuscript.projectId,
    actor: SYSTEM_ACTOR,
    action: "claim.validity_assessed",
    targetEntityType: "claim_validity_assessment",
    targetEntityId: persisted.id,
    targetSnapshotRef: assessment.basedOnSnapshotRef,
    sourceClassification: "system",
    context: {
      claimId: assessment.claimId,
      overallValidityScore: assessment.overallValidityScore,
      scoreBand: assessment.scoreBand,
      sourceMode: assessment.sourceMode
    }
  });

  return validityAssessmentFromRecord(persisted);
}

export async function addFinalIntentApproval(input: {
  manuscriptId: string;
  actorId: string;
  notes?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
}): Promise<ApprovalEvent> {
  const manuscriptId = requireManuscriptId(input.manuscriptId, "confirm final export intent");
  const approvalContext = await resolveAuthority(manuscriptId, input.actorId);
  assertCanConfirmFinalIntentAuthority({ actor: approvalContext.actor, authority: approvalContext.authority });
  const currentGraph = await getResearchObjectGraph(manuscriptId);
  const targetSnapshotRef = input.targetSnapshotRef ?? createCurrentManuscriptTrustSnapshotRef(currentGraph);

  const approvalEvent = createApprovalEvent({
    id: `approval_${Date.now()}`,
    manuscriptId,
    approvalType: "pre_export_intent_confirmation",
    actor: approvalContext.actor,
    sourceClassification: "human",
    targetEntityType: "manuscript",
    targetEntityId: manuscriptId,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef,
    approved: true,
    notes: input.notes ?? "Author confirmed rendered article intent for export."
  });

  const persisted = await prisma.approvalEvent.create({
    data: {
      manuscriptId: approvalEvent.manuscriptId,
      approvalType: approvalEvent.approvalType,
      actorType: approvalEvent.actorType,
      actorId: approvalEvent.actorId,
      sourceClassification: approvalEvent.sourceClassification,
      targetEntityType: approvalEvent.targetEntityType,
      targetEntityId: approvalEvent.targetEntityId,
      targetVersionId: approvalEvent.targetVersionId,
      targetSnapshotRef: approvalEvent.targetSnapshotRef,
      approved: approvalEvent.approved,
      notes: approvalEvent.notes
    }
  });

  await writeAuditLog({
    manuscriptId,
    projectId: approvalContext.manuscript.projectId,
    actor: approvalContext.actor,
    action: "approval.final_intent_confirmation",
    targetEntityType: "manuscript",
    targetEntityId: manuscriptId,
    targetVersionId: input.targetVersionId,
    targetSnapshotRef,
    sourceClassification: "human",
    afterSnapshot: { approved: true }
  });

  return approvalFromRecord(persisted);
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
      limitations: graph.limitations.length
    }
  };
}

export async function createExport(input?: {
  confirmFinalIntent?: boolean;
  actorId?: string;
  manuscriptId?: string;
  targetVersionId?: string;
  targetSnapshotRef?: string;
  mode?: ExportMode;
}) {
  const manuscriptId = requireManuscriptId(input?.manuscriptId, "create an export");
  if (!input?.actorId) {
    throw new Error("actorId is required to create an export.");
  }
  let graph = await getResearchObjectGraph(manuscriptId);
  const mode = input?.mode ?? "publication_intent";

  if (input?.confirmFinalIntent) {
    if (!input.actorId) throw new Error("Final intent confirmation requires an actorId.");
    const approval = await addFinalIntentApproval({
      manuscriptId,
      actorId: input.actorId,
      targetVersionId: input.targetVersionId,
      targetSnapshotRef: input.targetSnapshotRef
    });
    graph = { ...graph, approvals: [...graph.approvals, approval] };
  }

  const result = createDocxPlaceholderExport({
    id: `export_${Date.now()}`,
    graph,
    createdBy: input.actorId,
    versionId: input?.targetVersionId ?? "version_prisma_placeholder",
    now: new Date().toISOString(),
    mode
  });

  const exportRecord = await prisma.exportPackage.create({
    data: {
      manuscriptId: graph.manuscript.id,
      exportType: result.exportPackage.exportType,
      status: result.exportPackage.status,
      versionId: result.exportPackage.versionId,
      finalApprovalEventId: result.exportPackage.finalApprovalEventId,
      snapshotPointer: result.exportPackage.snapshotPointer,
      artifactPointer: result.exportPackage.artifactPointer,
      readinessReport: result.exportPackage.readinessReport,
      createdBy: input.actorId
    }
  });

  await writeAuditLog({
    manuscriptId: graph.manuscript.id,
    projectId: graph.manuscript.projectId,
    actor: actorFromId(input.actorId),
    action: "export.placeholder_created",
    targetEntityType: "export_package",
    targetEntityId: exportRecord.id,
    targetVersionId: input?.targetVersionId,
    targetSnapshotRef: result.exportPackage.snapshotPointer,
    sourceClassification: "human",
    afterSnapshot: {
      status: exportRecord.status,
      canExport: result.exportPackage.readinessReport.canExport,
      mode,
      exportOutcome: result.exportOutcome.status
    }
  });

  return { ...result, exportPackage: { ...result.exportPackage, id: exportRecord.id } };
}
