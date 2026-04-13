import { Prisma } from "@prisma/client";
import { prisma } from "@/persistence/prisma-client";
import type { GitHubDeliveryInput, TaskCenterItem, TaskCenterItemInput } from "./types";

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toTaskCenterItem(record: any): TaskCenterItem {
  return {
    id: record.id,
    externalId: record.externalId,
    source: record.source,
    eventType: record.eventType,
    itemType: record.itemType,
    status: record.status,
    priority: record.priority,
    repository: record.repository,
    title: record.title,
    url: record.url ?? undefined,
    branch: record.branch ?? undefined,
    actor: record.actor ?? undefined,
    summary: record.summary ?? undefined,
    risk: record.risk ?? undefined,
    metadata: record.metadata ?? undefined,
    lastDeliveryId: record.lastDeliveryId ?? undefined,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt)
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

export async function getGitHubDelivery(deliveryId: string): Promise<GitHubDeliveryInput | null> {
  const record = await prisma.gitHubWebhookDelivery.findUnique({ where: { id: deliveryId } });
  return record
    ? {
        id: record.id,
        eventType: record.eventType,
        repository: record.repository ?? undefined,
        action: record.action ?? undefined,
        taskCenterItemId: record.taskCenterItemId ?? undefined
      }
    : null;
}

export async function recordGitHubDelivery(input: GitHubDeliveryInput): Promise<void> {
  await prisma.gitHubWebhookDelivery.create({
    data: {
      id: input.id,
      eventType: input.eventType,
      repository: input.repository,
      action: input.action,
      taskCenterItemId: input.taskCenterItemId
    }
  });
}

export async function upsertTaskCenterItem(input: TaskCenterItemInput): Promise<TaskCenterItem> {
  const record = await prisma.taskCenterItem.upsert({
    where: { externalId: input.externalId },
    create: {
      externalId: input.externalId,
      source: input.source ?? "github",
      eventType: input.eventType,
      itemType: input.itemType,
      status: input.status,
      priority: input.priority,
      repository: input.repository,
      title: input.title,
      url: input.url,
      branch: input.branch,
      actor: input.actor,
      summary: input.summary,
      risk: input.risk,
      metadata: toPrismaJson(input.metadata),
      lastDeliveryId: input.lastDeliveryId
    },
    update: {
      eventType: input.eventType,
      itemType: input.itemType,
      status: input.status,
      priority: input.priority,
      title: input.title,
      url: input.url,
      branch: input.branch,
      actor: input.actor,
      summary: input.summary,
      risk: input.risk,
      metadata: toPrismaJson(input.metadata),
      lastDeliveryId: input.lastDeliveryId
    }
  });

  return toTaskCenterItem(record);
}

export async function listTaskCenterItems(input: {
  repository?: string;
  status?: string;
  limit?: number;
} = {}): Promise<TaskCenterItem[]> {
  const take = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const records = await prisma.taskCenterItem.findMany({
    where: {
      ...(input.repository ? { repository: input.repository } : {}),
      ...(input.status ? { status: input.status } : {})
    },
    orderBy: { updatedAt: "desc" },
    take
  });

  return records.map(toTaskCenterItem);
}

export async function getTaskCenterItem(id: string): Promise<TaskCenterItem | null> {
  const record = await prisma.taskCenterItem.findUnique({ where: { id } });
  return record ? toTaskCenterItem(record) : null;
}
