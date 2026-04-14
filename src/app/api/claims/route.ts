import { createClaim, listClaims, updateClaim } from "@/persistence/runtime-store";
import { claimInputSchema, claimUpdateInputSchema } from "@/domain/validation";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  return NextResponse.json({ claims: await listClaims(manuscriptId) });
}

export async function POST(request: Request) {
  const parseResult = claimInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({
      claim: await createClaim({ ...parseResult.data, createdBy: actor.id })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Claim creation failed." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const parseResult = claimUpdateInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    return NextResponse.json({
      claim: await updateClaim({ ...parseResult.data, updatedBy: actor.id })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Claim update failed." }, { status: 409 });
  }
}
