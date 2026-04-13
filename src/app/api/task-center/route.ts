import { requireManagerApiKey } from "@/task-center/auth";
import { listTaskCenterItems } from "@/task-center/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = requireManagerApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);

  const items = await listTaskCenterItems({
    repository: url.searchParams.get("repository") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: Number.isFinite(limit) ? limit : 20
  });

  return NextResponse.json({ items });
}
