import type {
  Actor,
  AuditLog,
  Claim,
  EntityId,
  Evidence,
  Limitation,
  MethodBlock,
  ResearchObjectGraph,
  Section,
  SectionObjectRef,
  Version
} from "./types";
import { DomainPolicyError, isHumanAuthor } from "./policies";

function timestamp(now?: string): string {
  return now ?? new Date().toISOString();
}

function assertFound<T>(entity: T | undefined, message: string): T {
  if (!entity) {
    throw new DomainPolicyError(message);
  }

  return entity;
}

export function createAuditLog(input: {
  id: EntityId;
  actor: Actor;
  action: string;
  targetEntityType: string;
  targetEntityId: EntityId;
  projectId?: EntityId;
  manuscriptId?: EntityId;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  context?: Record<string, unknown>;
  now?: string;
}): AuditLog {
  return {
    id: input.id,
    type: "audit_log",
    projectId: input.projectId,
    manuscriptId: input.manuscriptId,
    actorType: input.actor.type,
    actorId: input.actor.id,
    sourceClassification:
      input.actor.type === "ai" ? "ai_suggestion" : input.actor.type === "system" ? "system" : "human",
    action: input.action,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    context: input.context,
    createdAt: timestamp(input.now)
  };
}

export function createVersionSnapshot(input: {
  id: EntityId;
  graph: ResearchObjectGraph;
  actor: Actor;
  changeSummary: string;
  parentVersionId?: EntityId;
  now?: string;
}): Version {
  return {
    id: input.id,
    type: "version",
    manuscriptId: input.graph.manuscript.id,
    parentVersionId: input.parentVersionId,
    createdBy: input.actor.id,
    createdAt: timestamp(input.now),
    changeSummary: input.changeSummary,
    snapshotPointer: `memory://versions/${input.id}`
  };
}

export function linkClaimToEvidence(input: {
  graph: ResearchObjectGraph;
  claimId: EntityId;
  evidenceId: EntityId;
  actor: Actor;
  confirm?: boolean;
  now?: string;
}): ResearchObjectGraph {
  const claim = assertFound(
    input.graph.claims.find((item) => item.id === input.claimId),
    `Claim ${input.claimId} was not found.`
  );
  const evidence = assertFound(
    input.graph.evidence.find((item) => item.id === input.evidenceId),
    `Evidence ${input.evidenceId} was not found.`
  );
  const status = input.confirm ? "confirmed" : "proposed";

  if (input.confirm && !isHumanAuthor(input.actor)) {
    throw new DomainPolicyError("Only a human author can confirm claim-evidence links.");
  }

  const updatedClaim: Claim = {
    ...claim,
    linkedEvidence: [
      ...claim.linkedEvidence.filter((link) => link.evidenceId !== input.evidenceId),
      {
        evidenceId: input.evidenceId,
        status,
        confirmedBy: input.confirm ? input.actor.id : undefined,
        confirmedAt: input.confirm ? timestamp(input.now) : undefined
      }
    ],
    updatedAt: timestamp(input.now)
  };
  const updatedEvidence: Evidence = {
    ...evidence,
    linkedClaimIds: Array.from(new Set([...evidence.linkedClaimIds, input.claimId])),
    updatedAt: timestamp(input.now)
  };

  const auditLog = createAuditLog({
    id: `audit_${(input.graph.auditLogs?.length ?? 0) + 1}`,
    actor: input.actor,
    action: input.confirm ? "claim_evidence_link_confirmed" : "claim_evidence_link_proposed",
    targetEntityType: "claim",
    targetEntityId: input.claimId,
    manuscriptId: input.graph.manuscript.id,
    beforeSnapshot: claim as unknown as Record<string, unknown>,
    afterSnapshot: updatedClaim as unknown as Record<string, unknown>,
    context: { evidenceId: input.evidenceId },
    now: input.now
  });

  return {
    ...input.graph,
    claims: input.graph.claims.map((item) => (item.id === input.claimId ? updatedClaim : item)),
    evidence: input.graph.evidence.map((item) => (item.id === input.evidenceId ? updatedEvidence : item)),
    auditLogs: [...(input.graph.auditLogs ?? []), auditLog]
  };
}

export function attachMethodToClaim(input: {
  graph: ResearchObjectGraph;
  claimId: EntityId;
  methodBlockId: EntityId;
  actor: Actor;
  confirm?: boolean;
  now?: string;
}): ResearchObjectGraph {
  const claim = assertFound(
    input.graph.claims.find((item) => item.id === input.claimId),
    `Claim ${input.claimId} was not found.`
  );
  const method = assertFound(
    input.graph.methods.find((item) => item.id === input.methodBlockId),
    `Method block ${input.methodBlockId} was not found.`
  );

  if (input.confirm && !isHumanAuthor(input.actor)) {
    throw new DomainPolicyError("Only a human author can confirm claim-method links.");
  }

  const updatedClaim: Claim = {
    ...claim,
    linkedMethods: [
      ...claim.linkedMethods.filter((link) => link.entityId !== input.methodBlockId),
      { entityId: input.methodBlockId, status: input.confirm ? "confirmed" : "proposed" }
    ],
    updatedAt: timestamp(input.now)
  };
  const updatedMethod: MethodBlock = {
    ...method,
    linkedClaimIds: Array.from(new Set([...method.linkedClaimIds, input.claimId])),
    updatedAt: timestamp(input.now)
  };

  return {
    ...input.graph,
    claims: input.graph.claims.map((item) => (item.id === input.claimId ? updatedClaim : item)),
    methods: input.graph.methods.map((item) => (item.id === input.methodBlockId ? updatedMethod : item))
  };
}

export function attachLimitationToClaim(input: {
  graph: ResearchObjectGraph;
  claimId: EntityId;
  limitationId: EntityId;
  actor: Actor;
  confirm?: boolean;
  now?: string;
}): ResearchObjectGraph {
  const claim = assertFound(
    input.graph.claims.find((item) => item.id === input.claimId),
    `Claim ${input.claimId} was not found.`
  );
  const limitation = assertFound(
    input.graph.limitations.find((item) => item.id === input.limitationId),
    `Limitation ${input.limitationId} was not found.`
  );

  if (input.confirm && !isHumanAuthor(input.actor)) {
    throw new DomainPolicyError("Only a human author can confirm claim-limitation links.");
  }

  const updatedClaim: Claim = {
    ...claim,
    linkedLimitations: [
      ...claim.linkedLimitations.filter((link) => link.entityId !== input.limitationId),
      { entityId: input.limitationId, status: input.confirm ? "confirmed" : "proposed" }
    ],
    updatedAt: timestamp(input.now)
  };
  const updatedLimitation: Limitation = {
    ...limitation,
    linkedClaimIds: Array.from(new Set([...limitation.linkedClaimIds, input.claimId])),
    updatedAt: timestamp(input.now)
  };

  return {
    ...input.graph,
    claims: input.graph.claims.map((item) => (item.id === input.claimId ? updatedClaim : item)),
    limitations: input.graph.limitations.map((item) => (item.id === input.limitationId ? updatedLimitation : item))
  };
}

export function createSectionAssembly(input: {
  id: EntityId;
  graph: ResearchObjectGraph;
  title: string;
  objectRefs: SectionObjectRef[];
  actor: Actor;
  orderIndex?: number;
  now?: string;
}): Section {
  if (input.objectRefs.length === 0) {
    throw new DomainPolicyError("A section assembly must reference at least one structured object.");
  }

  return {
    id: input.id,
    type: "section",
    manuscriptId: input.graph.manuscript.id,
    title: input.title,
    orderIndex: input.orderIndex ?? input.graph.sections.length + 1,
    objectRefs: input.objectRefs,
    status: "draft",
    createdBy: input.actor.id,
    createdAt: timestamp(input.now),
    updatedAt: timestamp(input.now)
  };
}
