import { supportMappingInputSchema } from "@/domain/validation";
import { updateSupportAssetClaimMapping } from "@/persistence/runtime-store";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const parseResult = supportMappingInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    const supportAsset = await updateSupportAssetClaimMapping({
      ...parseResult.data,
      actorId: actor.id
    });

    return NextResponse.json({ supportAsset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Support mapping failed." },
      { status: 409 }
    );
  }
}
