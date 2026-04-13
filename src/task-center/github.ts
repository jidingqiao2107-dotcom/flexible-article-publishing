import { createHmac, timingSafeEqual } from "node:crypto";
import type { TaskCenterItemInput, TaskCenterPriority, TaskCenterStatus } from "./types";

type JsonRecord = Record<string, any>;

export function verifyGitHubWebhookSignature(input: {
  body: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  if (!input.signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", input.secret).update(input.body).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(input.signatureHeader, "utf8");

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function repositoryName(payload: JsonRecord): string | undefined {
  return payload.repository?.full_name;
}

function senderLogin(payload: JsonRecord): string | undefined {
  return payload.sender?.login;
}

function branchFromRef(ref?: string): string | undefined {
  return ref?.replace(/^refs\/heads\//, "");
}

function pullRequestStatus(action: string | undefined, pullRequest: JsonRecord): TaskCenterStatus {
  if (pullRequest.draft) return "in_progress";
  if (action === "closed") return pullRequest.merged ? "done" : "cancelled";
  if (action === "review_requested" || action === "ready_for_review" || action === "opened" || action === "reopened") {
    return "awaiting_review";
  }
  if (action === "synchronize") return "awaiting_review";
  if (action === "converted_to_draft") return "in_progress";
  return "in_progress";
}

function reviewStatus(state?: string): TaskCenterStatus {
  if (state === "approved") return "approved";
  if (state === "changes_requested") return "changes_requested";
  if (state === "commented") return "reviewed";
  return "reviewed";
}

function workflowStatus(workflowRun: JsonRecord): TaskCenterStatus {
  if (workflowRun.status !== "completed") return "in_progress";
  if (workflowRun.conclusion === "success") return "done";
  if (workflowRun.conclusion === "cancelled" || workflowRun.conclusion === "skipped") return "cancelled";
  if (workflowRun.conclusion) return "failed";
  return "unknown";
}

function priorityForStatus(status: TaskCenterStatus): TaskCenterPriority {
  if (status === "failed" || status === "changes_requested" || status === "cancelled") return "high";
  if (status === "awaiting_review") return "medium";
  return "low";
}

export function taskCenterInputFromGitHubEvent(input: {
  eventType: string;
  deliveryId: string;
  payload: JsonRecord;
}): TaskCenterItemInput | null {
  const repository = repositoryName(input.payload);
  if (!repository) return null;

  const actor = senderLogin(input.payload);
  const action = input.payload.action as string | undefined;

  if (input.eventType === "push") {
    const branch = branchFromRef(input.payload.ref);
    const commitCount = Array.isArray(input.payload.commits) ? input.payload.commits.length : 0;

    return {
      externalId: `github:${repository}:push:${input.payload.ref}`,
      eventType: input.eventType,
      itemType: "branch_update",
      status: "in_progress",
      priority: "low",
      repository,
      title: `${repository}: ${branch ?? "branch"} updated`,
      url: input.payload.compare,
      branch,
      actor,
      summary: `${commitCount} commit(s) pushed to ${branch ?? input.payload.ref}.`,
      metadata: {
        before: input.payload.before,
        after: input.payload.after,
        commits: (input.payload.commits ?? []).slice(0, 10).map((commit: JsonRecord) => ({
          id: commit.id,
          message: commit.message,
          url: commit.url
        }))
      },
      lastDeliveryId: input.deliveryId
    };
  }

  if (input.eventType === "pull_request" && input.payload.pull_request) {
    const pullRequest = input.payload.pull_request;
    const status = pullRequestStatus(action, pullRequest);

    return {
      externalId: `github:${repository}:pull_request:${pullRequest.number}`,
      eventType: input.eventType,
      itemType: "pull_request",
      status,
      priority: priorityForStatus(status),
      repository,
      title: `PR #${pullRequest.number}: ${pullRequest.title}`,
      url: pullRequest.html_url,
      branch: pullRequest.head?.ref,
      actor,
      summary: `Pull request ${action ?? "updated"} by ${actor ?? "unknown actor"}.`,
      risk: pullRequest.draft ? "Draft PR is not ready for manager review yet." : undefined,
      metadata: {
        action,
        number: pullRequest.number,
        base: pullRequest.base?.ref,
        head: pullRequest.head?.ref,
        merged: pullRequest.merged ?? false,
        draft: pullRequest.draft ?? false
      },
      lastDeliveryId: input.deliveryId
    };
  }

  if (input.eventType === "pull_request_review" && input.payload.pull_request && input.payload.review) {
    const pullRequest = input.payload.pull_request;
    const status = reviewStatus(input.payload.review.state);

    return {
      externalId: `github:${repository}:pull_request:${pullRequest.number}`,
      eventType: input.eventType,
      itemType: "pull_request",
      status,
      priority: priorityForStatus(status),
      repository,
      title: `PR #${pullRequest.number}: ${pullRequest.title}`,
      url: pullRequest.html_url,
      branch: pullRequest.head?.ref,
      actor,
      summary: `Review ${input.payload.review.state ?? "submitted"} by ${actor ?? "unknown reviewer"}.`,
      risk: status === "changes_requested" ? "Reviewer requested changes before merge." : undefined,
      metadata: {
        action,
        number: pullRequest.number,
        reviewState: input.payload.review.state,
        reviewUrl: input.payload.review.html_url
      },
      lastDeliveryId: input.deliveryId
    };
  }

  if (input.eventType === "workflow_run" && input.payload.workflow_run) {
    const workflowRun = input.payload.workflow_run;
    const status = workflowStatus(workflowRun);

    return {
      externalId: `github:${repository}:workflow_run:${workflowRun.id}`,
      eventType: input.eventType,
      itemType: "workflow_run",
      status,
      priority: priorityForStatus(status),
      repository,
      title: `${workflowRun.name ?? "Workflow"}: ${workflowRun.display_title ?? workflowRun.head_branch ?? "run"}`,
      url: workflowRun.html_url,
      branch: workflowRun.head_branch,
      actor,
      summary: `Workflow ${workflowRun.status ?? "updated"} with conclusion ${workflowRun.conclusion ?? "pending"}.`,
      risk: status === "failed" ? "CI failed or requires attention before the manager can treat this as ready." : undefined,
      metadata: {
        action,
        runId: workflowRun.id,
        workflowId: workflowRun.workflow_id,
        status: workflowRun.status,
        conclusion: workflowRun.conclusion
      },
      lastDeliveryId: input.deliveryId
    };
  }

  if (input.eventType === "issue_comment" && input.payload.issue?.pull_request) {
    const issue = input.payload.issue;

    return {
      externalId: `github:${repository}:pull_request:${issue.number}`,
      eventType: input.eventType,
      itemType: "pull_request",
      status: "reviewed",
      priority: "low",
      repository,
      title: `PR #${issue.number}: ${issue.title}`,
      url: issue.html_url,
      actor,
      summary: `Comment ${action ?? "updated"} by ${actor ?? "unknown commenter"}.`,
      metadata: {
        action,
        number: issue.number,
        commentUrl: input.payload.comment?.html_url,
        commentPreview: input.payload.comment?.body?.slice(0, 500)
      },
      lastDeliveryId: input.deliveryId
    };
  }

  return null;
}

export function isRepositoryAllowed(repository: string | undefined, allowlist: string | undefined): boolean {
  if (!allowlist?.trim()) return true;
  if (!repository) return false;

  return allowlist
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(repository.toLowerCase());
}
