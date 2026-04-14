import { getStructuredManuscriptView } from "@/persistence/runtime-store";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  return NextResponse.json(await getStructuredManuscriptView(manuscriptId));
}
