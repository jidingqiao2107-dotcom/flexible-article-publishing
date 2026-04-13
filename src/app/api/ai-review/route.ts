import { runReview } from "@/persistence/prisma-workflow-store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { manuscriptId?: string };
  return NextResponse.json({ results: await runReview(body.manuscriptId) });
}
