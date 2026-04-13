export type TaskCenterStatus =
  | "awaiting_review"
  | "in_progress"
  | "approved"
  | "changes_requested"
  | "reviewed"
  | "failed"
  | "cancelled"
  | "done"
  | "unknown";

export type TaskCenterPriority = "low" | "medium" | "high";

export type TaskCenterItem = {
  id: string;
  externalId: string;
  source: "github";
  eventType: string;
  itemType: string;
  status: TaskCenterStatus;
  priority: TaskCenterPriority;
  repository: string;
  title: string;
  url?: string;
  branch?: string;
  actor?: string;
  summary?: string;
  risk?: string;
  metadata?: unknown;
  lastDeliveryId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskCenterItemInput = Omit<TaskCenterItem, "id" | "createdAt" | "updatedAt" | "source"> & {
  source?: "github";
};

export type GitHubDeliveryInput = {
  id: string;
  eventType: string;
  repository?: string;
  action?: string;
  taskCenterItemId?: string;
};
