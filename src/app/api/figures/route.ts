import { createFigure, listFigures } from "@/persistence/runtime-store";
import { figureInputSchema } from "@/domain/validation";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  return NextResponse.json({ figures: await listFigures(manuscriptId) });
}

export async function POST(request: Request) {
  const parseResult = figureInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({
      figure: await createFigure({ ...parseResult.data, createdBy: actor.id })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Figure creation failed." }, { status: 409 });
  }
}
