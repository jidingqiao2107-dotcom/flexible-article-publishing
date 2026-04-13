import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isRepositoryAllowed, taskCenterInputFromGitHubEvent, verifyGitHubWebhookSignature } from "./github";

describe("GitHub task center adapter", () => {
  it("verifies GitHub SHA-256 webhook signatures", () => {
    const body = JSON.stringify({ zen: "Keep it logically awesome." });
    const secret = "test-secret";
    const signatureHeader = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    expect(verifyGitHubWebhookSignature({ body, secret, signatureHeader })).toBe(true);
    expect(verifyGitHubWebhookSignature({ body, secret, signatureHeader: "sha256=bad" })).toBe(false);
  });

  it("maps pull request events to manager-visible task center items", () => {
    const item = taskCenterInputFromGitHubEvent({
      eventType: "pull_request",
      deliveryId: "delivery-1",
      payload: {
        action: "opened",
        repository: { full_name: "acme/route-a" },
        sender: { login: "codex" },
        pull_request: {
          number: 42,
          title: "Add task center webhook",
          html_url: "https://github.com/acme/route-a/pull/42",
          draft: false,
          merged: false,
          head: { ref: "codex/task-center" },
          base: { ref: "main" }
        }
      }
    });

    expect(item).toMatchObject({
      externalId: "github:acme/route-a:pull_request:42",
      status: "awaiting_review",
      priority: "medium",
      repository: "acme/route-a",
      branch: "codex/task-center",
      lastDeliveryId: "delivery-1"
    });
  });

  it("can restrict events to an explicit repository allowlist", () => {
    expect(isRepositoryAllowed("acme/route-a", "acme/route-a,other/repo")).toBe(true);
    expect(isRepositoryAllowed("acme/route-b", "acme/route-a,other/repo")).toBe(false);
    expect(isRepositoryAllowed("acme/route-b", undefined)).toBe(true);
  });
});
