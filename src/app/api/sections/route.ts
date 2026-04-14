import { claimSectionPlacementInputSchema, sectionInputSchema } from "@/domain/validation";
import { createSection, getResearchObjectGraph, updateClaimSectionPlacement } from "@/persistence/runtime-store";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  const graph = await getResearchObjectGraph(manuscriptId);
  return NextResponse.json({ sections: graph.sections });
}

export async function POST(request: Request) {
  const parseResult = sectionInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({ section: await createSection({ ...parseResult.data, createdBy: actor.id }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Section creation failed." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const parseResult = claimSectionPlacementInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({ section: await updateClaimSectionPlacement({ ...parseResult.data, updatedBy: actor.id }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Section placement update failed." }, { status: 409 });
  }
}
