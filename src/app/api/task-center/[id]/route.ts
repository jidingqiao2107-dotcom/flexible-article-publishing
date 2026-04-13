import { requireManagerApiKey } from "@/task-center/auth";
import { getTaskCenterItem } from "@/task-center/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = requireManagerApiKey(request);
  if (authError) return authError;

  const { id } = await context.params;
  const item = await getTaskCenterItem(id);

  if (!item) {
    return NextResponse.json({ error: "Task center item was not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
}
