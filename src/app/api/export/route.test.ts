import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertNoActorOverride: vi.fn(),
  requireResolvedActor: vi.fn(),
  createExport: vi.fn()
}));

vi.mock("@/server/identity", () => ({
  assertNoActorOverride: mocks.assertNoActorOverride,
  requireResolvedActor: mocks.requireResolvedActor
}));

vi.mock("@/persistence/runtime-store", () => ({
  createExport: mocks.createExport
}));

import { POST } from "./route";

describe("export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireResolvedActor.mockResolvedValue({
      id: "author_001",
      type: "human_author",
      displayName: "Dr. Author"
    });
  });

  it("passes draft/internal export mode through without requiring final intent confirmation", async () => {
    mocks.createExport.mockResolvedValue({
      exportMode: "draft_internal",
      exportOutcome: {
        status: "warning_bearing_but_allowed",
        blockingReasons: [],
        warningReasons: ["Human approval is still missing for publication intent."]
      },
      exportPackage: {
        id: "export_001",
        status: "generated",
        readinessReport: {
          canExport: true,
          blockingReasons: [],
          warnings: ["Human approval is still missing for publication intent."]
        }
      },
      renderedText: "Draft manuscript preview"
    });

    const response = await POST(
      new Request("http://localhost/api/export", {
        method: "POST",
        body: JSON.stringify({
          manuscriptId: "manuscript_001",
          mode: "draft_internal"
        })
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.requireResolvedActor).toHaveBeenCalledTimes(1);
    expect(mocks.createExport).toHaveBeenCalledWith({
      confirmFinalIntent: false,
      actorId: "author_001",
      manuscriptId: "manuscript_001",
      targetVersionId: undefined,
      targetSnapshotRef: undefined,
      mode: "draft_internal"
    });
    expect(payload.exportMode).toBe("draft_internal");
    expect(payload.exportOutcome.status).toBe("warning_bearing_but_allowed");
  });

  it("returns a blocked publication-intent export when the trust contract says it is stale", async () => {
    mocks.createExport.mockResolvedValue({
      exportMode: "publication_intent",
      exportOutcome: {
        status: "stale_reapproval_required",
        blockingReasons: ["Claim claim_001: The support bundle changed after the last human approval, so reapproval is required."],
        warningReasons: []
      },
      exportPackage: {
        id: "export_002",
        status: "blocked",
        readinessReport: {
          canExport: false,
          blockingReasons: ["Claim claim_001: The support bundle changed after the last human approval, so reapproval is required."],
          warnings: []
        }
      }
    });

    const response = await POST(
      new Request("http://localhost/api/export", {
        method: "POST",
        body: JSON.stringify({
          manuscriptId: "manuscript_001",
          mode: "publication_intent"
        })
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.exportOutcome.status).toBe("stale_reapproval_required");
  });
});
