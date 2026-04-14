import { runReview } from "@/persistence/runtime-store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { manuscriptId?: string };
  return NextResponse.json({ results: await runReview(body.manuscriptId) });
}
