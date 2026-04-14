import { claimDiscussionInputSchema } from "@/domain/validation";
import { askClaimDiscussion, getClaimDiscussionThread } from "@/persistence/runtime-store";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const claimId = new URL(request.url).searchParams.get("claimId");

  if (!claimId) {
    return NextResponse.json({ error: "claimId is required." }, { status: 400 });
  }

  try {
    return NextResponse.json({
      thread: await getClaimDiscussionThread(claimId)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claim discussion lookup failed." },
      { status: 404 }
    );
  }
}

export async function POST(request: Request) {
  const parseResult = claimDiscussionInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requireResolvedActor(request);
    const result = await askClaimDiscussion({
      ...parseResult.data,
      actorId: actor.id
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claim discussion failed." },
      { status: 409 }
    );
  }
}
