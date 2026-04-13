import { limitationInputSchema } from "@/domain/validation";
import { createLimitation, listLimitations } from "@/persistence/prisma-workflow-store";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  return NextResponse.json({ limitations: await listLimitations(manuscriptId) });
}

export async function POST(request: Request) {
  const parseResult = limitationInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({ limitation: await createLimitation({ ...parseResult.data, createdBy: actor.id }) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Limitation creation failed." },
      { status: 409 }
    );
  }
}
