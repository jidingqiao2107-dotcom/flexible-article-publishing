import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertNoActorOverride: vi.fn(),
  requireResolvedActor: vi.fn(),
  approveClaim: vi.fn(),
  approveClaimEvidenceLink: vi.fn(),
  addFinalIntentApproval: vi.fn(),
  markClaimPublicationReady: vi.fn()
}));

vi.mock("@/server/identity", () => ({
  assertNoActorOverride: mocks.assertNoActorOverride,
  requireResolvedActor: mocks.requireResolvedActor
}));

vi.mock("@/persistence/runtime-store", () => ({
  approveClaim: mocks.approveClaim,
  approveClaimEvidenceLink: mocks.approveClaimEvidenceLink,
  addFinalIntentApproval: mocks.addFinalIntentApproval,
  markClaimPublicationReady: mocks.markClaimPublicationReady
}));

import { POST } from "./route";

describe("approvals route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireResolvedActor.mockResolvedValue({
      id: "author_001",
      type: "human_author",
      displayName: "Dr. Author"
    });
  });

  it("approves a claim using the resolved server actor", async () => {
    mocks.approveClaim.mockResolvedValue({ claim: { id: "claim_001" } });

    const response = await POST(
      new Request("http://localhost/api/approvals", {
        method: "POST",
        body: JSON.stringify({
          approvalType: "claim_approval",
          targetEntityId: "claim_001"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.requireResolvedActor).toHaveBeenCalledTimes(1);
    expect(mocks.approveClaim).toHaveBeenCalledWith("claim_001", "author_001", {
      notes: undefined,
      targetVersionId: undefined,
      targetSnapshotRef: undefined
    });
  });

  it("approves a claim-evidence link using the resolved server actor", async () => {
    mocks.approveClaimEvidenceLink.mockResolvedValue({
      claim: { id: "claim_001" },
      approvalEvent: { id: "approval_001" }
    });

    const response = await POST(
      new Request("http://localhost/api/approvals", {
        method: "POST",
        body: JSON.stringify({
          approvalType: "claim_evidence_approval",
          targetEntityId: "claim_001",
          evidenceId: "evidence_001"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.requireResolvedActor).toHaveBeenCalledTimes(1);
    expect(mocks.approveClaimEvidenceLink).toHaveBeenCalledWith({
      claimId: "claim_001",
      evidenceId: "evidence_001",
      actorId: "author_001",
      notes: undefined,
      targetVersionId: undefined,
      targetSnapshotRef: undefined
    });
  });

  it("marks claim publication-ready through the resolved server actor path", async () => {
    mocks.markClaimPublicationReady.mockResolvedValue({ id: "claim_001", publicationReady: true });

    const response = await POST(
      new Request("http://localhost/api/approvals", {
        method: "POST",
        body: JSON.stringify({
          approvalType: "claim_publication_ready",
          targetEntityId: "claim_001"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.markClaimPublicationReady).toHaveBeenCalledWith("claim_001", "author_001");
  });
});
