import { citationInputSchema } from "@/domain/validation";
import { createCitation, listCitations } from "@/persistence/prisma-workflow-store";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  return NextResponse.json({ citations: await listCitations(manuscriptId) });
}

export async function POST(request: Request) {
  const parseResult = citationInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json({
      citation: await createCitation(parseResult.data)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Citation creation failed." },
      { status: 409 }
    );
  }
}
