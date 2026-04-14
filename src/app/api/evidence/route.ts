import { createEvidence, listEvidence, updateEvidence } from "@/persistence/runtime-store";
import { evidenceInputSchema, evidenceUpdateInputSchema } from "@/domain/validation";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  return NextResponse.json({ evidence: await listEvidence(manuscriptId) });
}

export async function POST(request: Request) {
  const parseResult = evidenceInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({
      evidence: await createEvidence({ ...parseResult.data, createdBy: actor.id })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evidence creation failed." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const parseResult = evidenceUpdateInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({
      evidence: await updateEvidence({ ...parseResult.data, updatedBy: actor.id })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evidence update failed." }, { status: 409 });
  }
}
