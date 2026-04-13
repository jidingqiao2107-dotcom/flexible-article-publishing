import { isRepositoryAllowed, taskCenterInputFromGitHubEvent, verifyGitHubWebhookSignature } from "@/task-center/github";
import { getGitHubDelivery, recordGitHubDelivery, upsertTaskCenterItem } from "@/task-center/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "GITHUB_WEBHOOK_SECRET is not configured." }, { status: 500 });
  }

  const body = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!verifyGitHubWebhookSignature({ body, signatureHeader, secret })) {
    return NextResponse.json({ error: "Invalid GitHub webhook signature." }, { status: 401 });
  }

  const eventType = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");

  if (!eventType || !deliveryId) {
    return NextResponse.json({ error: "Missing GitHub event or delivery header." }, { status: 400 });
  }

  if (await getGitHubDelivery(deliveryId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const repository = payload.repository?.full_name;
  const action = payload.action;

  if (!isRepositoryAllowed(repository, process.env.GITHUB_REPOSITORY_ALLOWLIST)) {
    return NextResponse.json({ error: "Repository is not allowed for this task center." }, { status: 403 });
  }

  const taskInput = taskCenterInputFromGitHubEvent({ eventType, deliveryId, payload });

  if (!taskInput) {
    await recordGitHubDelivery({ id: deliveryId, eventType, repository, action });
    return NextResponse.json({ ok: true, ignored: true, eventType });
  }

  const item = await upsertTaskCenterItem(taskInput);
  await recordGitHubDelivery({ id: deliveryId, eventType, repository, action, taskCenterItemId: item.id });

  return NextResponse.json({ ok: true, item });
}
