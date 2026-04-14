import { methodBlockInputSchema } from "@/domain/validation";
import { createMethodBlock, listMethods } from "@/persistence/runtime-store";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  return NextResponse.json({ methods: await listMethods(manuscriptId) });
}

export async function POST(request: Request) {
  const parseResult = methodBlockInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({ method: await createMethodBlock({ ...parseResult.data, createdBy: actor.id }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Method creation failed." }, { status: 409 });
  }
}
