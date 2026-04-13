import { linkEvidenceInputSchema } from "@/domain/validation";
import { approveClaimEvidenceLink } from "@/persistence/prisma-workflow-store";
import { assertNoActorOverride, requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const parseResult = linkEvidenceInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    assertNoActorOverride(parseResult.data);

    if (parseResult.data.confirm) {
      const actor = await requireResolvedActor(request);

      return NextResponse.json(
        await approveClaimEvidenceLink({
          claimId: parseResult.data.claimId,
          evidenceId: parseResult.data.evidenceId,
          actorId: actor.id,
          notes: parseResult.data.notes,
          targetVersionId: parseResult.data.targetVersionId,
          targetSnapshotRef: parseResult.data.targetSnapshotRef
        })
      );
    }

    return NextResponse.json(
      { error: "Prisma-backed proposed-only evidence links are not exposed yet; use confirm=true for Gate 2 approval." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claim-evidence linking failed." },
      { status: 409 }
    );
  }
}
