import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActorMembershipContext: vi.fn(),
  buildExpiredSessionCookie: vi.fn(() => "expired-cookie"),
  buildSessionCookie: vi.fn(() => "session-cookie"),
  clearSessionByToken: vi.fn(),
  createDevelopmentSession: vi.fn(),
  getSessionTokenFromRequest: vi.fn(() => "token"),
  requireResolvedActor: vi.fn()
}));

vi.mock("@/persistence/runtime-store", () => ({
  getActorMembershipContext: mocks.getActorMembershipContext
}));

vi.mock("@/server/identity", () => ({
  buildExpiredSessionCookie: mocks.buildExpiredSessionCookie,
  buildSessionCookie: mocks.buildSessionCookie,
  clearSessionByToken: mocks.clearSessionByToken,
  createDevelopmentSession: mocks.createDevelopmentSession,
  getSessionTokenFromRequest: mocks.getSessionTokenFromRequest,
  requireResolvedActor: mocks.requireResolvedActor
}));

import { POST } from "./route";

describe("session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    mocks.createDevelopmentSession.mockResolvedValue({
      token: "token",
      sessionId: "session_001",
      actor: {
        id: "author_001",
        type: "human_author",
        displayName: "Dr. Author"
      }
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a development session outside production", async () => {
    const response = await POST(
      new Request("http://localhost/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authorId: "author_001", label: "qa" })
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.createDevelopmentSession).toHaveBeenCalledWith({
      authorId: "author_001",
      label: "qa"
    });
    expect(response.headers.get("Set-Cookie")).toBe("session-cookie");
    expect(payload.actor.id).toBe("author_001");
  });

  it("blocks development session creation in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(
      new Request("http://localhost/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authorId: "author_001" })
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Development session creation is disabled in production."
    });
    expect(mocks.createDevelopmentSession).not.toHaveBeenCalled();
  });
});
