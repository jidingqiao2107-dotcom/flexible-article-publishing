import { describe, expect, it } from "vitest";
import {
  createSectionAssembly,
  createVersionSnapshot,
  linkClaimToEvidence,
  attachMethodToClaim,
  attachLimitationToClaim
} from "./graph-operations";
import { DomainPolicyError } from "./policies";
import { sampleAiActor, sampleGraph, sampleHumanAuthor } from "./sample-data";
import type { Limitation } from "./types";

const now = "2026-04-07T10:00:00.000Z";

describe("research object graph operations", () => {
  it("lets a human author confirm a claim-evidence link and records an audit log", () => {
    const graph = linkClaimToEvidence({
      graph: sampleGraph,
      claimId: sampleGraph.claims[0].id,
      evidenceId: sampleGraph.evidence[0].id,
      actor: sampleHumanAuthor,
      confirm: true,
      now
    });

    const updatedClaim = graph.claims.find((claim) => claim.id === sampleGraph.claims[0].id);

    expect(updatedClaim?.linkedEvidence[0]).toMatchObject({
      evidenceId: sampleGraph.evidence[0].id,
      status: "confirmed",
      confirmedBy: sampleHumanAuthor.id,
      confirmedAt: now
    });
    expect(graph.auditLogs?.[0]).toMatchObject({
      action: "claim_evidence_link_confirmed",
      actorType: "human_author",
      targetEntityId: sampleGraph.claims[0].id
    });
  });

  it("does not let AI confirm claim-evidence links", () => {
    expect(() =>
      linkClaimToEvidence({
        graph: sampleGraph,
        claimId: sampleGraph.claims[0].id,
        evidenceId: sampleGraph.evidence[0].id,
        actor: sampleAiActor,
        confirm: true,
        now
      })
    ).toThrow("Only a human author can confirm claim-evidence links.");
  });

  it("attaches a method to a claim as a confirmed structured link", () => {
    const graph = attachMethodToClaim({
      graph: sampleGraph,
      claimId: sampleGraph.claims[0].id,
      methodBlockId: sampleGraph.methods[0].id,
      actor: sampleHumanAuthor,
      confirm: true,
      now
    });

    expect(graph.claims[0].linkedMethods).toContainEqual({ entityId: sampleGraph.methods[0].id, status: "confirmed" });
  });

  it("does not let AI confirm claim-method links", () => {
    expect(() =>
      attachMethodToClaim({
        graph: sampleGraph,
        claimId: sampleGraph.claims[0].id,
        methodBlockId: sampleGraph.methods[0].id,
        actor: sampleAiActor,
        confirm: true,
        now
      })
    ).toThrow("Only a human author can confirm claim-method links.");
  });

  it("attaches a limitation to a conclusion claim", () => {
    const limitation: Limitation = {
      id: "limitation_test",
      type: "limitation",
      manuscriptId: sampleGraph.manuscript.id,
      text: "Small sample size limits generalizability.",
      linkedClaimIds: [],
      status: "draft",
      createdBy: sampleHumanAuthor.id,
      createdAt: now,
      updatedAt: now
    };
    const graph = attachLimitationToClaim({
      graph: { ...sampleGraph, limitations: [limitation] },
      claimId: sampleGraph.claims[0].id,
      limitationId: limitation.id,
      actor: sampleHumanAuthor,
      confirm: true,
      now
    });

    expect(graph.claims[0].linkedLimitations).toContainEqual({ entityId: limitation.id, status: "confirmed" });
    expect(graph.limitations[0].linkedClaimIds).toContain(sampleGraph.claims[0].id);
  });

  it("does not let AI confirm claim-limitation links", () => {
    const limitation: Limitation = {
      id: "limitation_ai_test",
      type: "limitation",
      manuscriptId: sampleGraph.manuscript.id,
      text: "Small sample size limits generalizability.",
      linkedClaimIds: [],
      status: "draft",
      createdBy: sampleHumanAuthor.id,
      createdAt: now,
      updatedAt: now
    };

    expect(() =>
      attachLimitationToClaim({
        graph: { ...sampleGraph, limitations: [limitation] },
        claimId: sampleGraph.claims[0].id,
        limitationId: limitation.id,
        actor: sampleAiActor,
        confirm: true,
        now
      })
    ).toThrow("Only a human author can confirm claim-limitation links.");
  });

  it("requires section assembly to reference structured objects", () => {
    expect(() =>
      createSectionAssembly({
        id: "section_empty",
        graph: sampleGraph,
        title: "Empty",
        objectRefs: [],
        actor: sampleHumanAuthor,
        now
      })
    ).toThrow(DomainPolicyError);
  });

  it("creates version snapshot pointers without coupling to the web framework", () => {
    const version = createVersionSnapshot({
      id: "version_001",
      graph: sampleGraph,
      actor: sampleHumanAuthor,
      changeSummary: "Initial structured manuscript snapshot.",
      now
    });

    expect(version).toMatchObject({
      type: "version",
      manuscriptId: sampleGraph.manuscript.id,
      createdBy: sampleHumanAuthor.id,
      snapshotPointer: "memory://versions/version_001"
    });
  });
});
