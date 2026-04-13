import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthor: vi.fn(),
  listAuthors: vi.fn(),
  requireResolvedActor: vi.fn()
}));

vi.mock("@/persistence/prisma-workflow-store", () => ({
  createAuthor: mocks.createAuthor,
  listAuthors: mocks.listAuthors
}));

vi.mock("@/server/identity", () => ({
  requireResolvedActor: mocks.requireResolvedActor
}));

import { POST } from "./route";

describe("authors route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    mocks.requireResolvedActor.mockResolvedValue({
      id: "author_admin",
      type: "human_author",
      displayName: "Dr. Admin"
    });
    mocks.createAuthor.mockResolvedValue({
      id: "author_new",
      type: "author",
      projectId: "project_001",
      displayName: "Dr. New Author"
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the resolved session actor when creating an author", async () => {
    const response = await POST(
      new Request("http://localhost/api/authors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project_001",
          displayName: "Dr. New Author",
          memberRole: "coauthor"
        })
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.requireResolvedActor).toHaveBeenCalledTimes(1);
    expect(mocks.createAuthor).toHaveBeenCalledWith({
      projectId: "project_001",
      displayName: "Dr. New Author",
      memberRole: "coauthor",
      createdBy: "author_admin"
    });
    expect(payload.author.id).toBe("author_new");
  });

  it("blocks public author creation in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(
      new Request("http://localhost/api/authors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project_001",
          displayName: "Dr. New Author"
        })
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Author creation through this route is disabled in production."
    });
    expect(mocks.createAuthor).not.toHaveBeenCalled();
  });
});
