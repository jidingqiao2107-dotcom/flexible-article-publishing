import { createExport } from "@/persistence/runtime-store";
import { assertNoActorOverride, requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    confirmFinalIntent?: boolean;
    manuscriptId?: string;
    targetVersionId?: string;
    targetSnapshotRef?: string;
    mode?: "draft_internal" | "publication_intent";
  };

  try {
    assertNoActorOverride(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Identity validation failed." },
      { status: 400 }
    );
  }

  try {
    if (!body.manuscriptId) {
      return NextResponse.json({ error: "manuscriptId is required for export." }, { status: 400 });
    }

    const resolvedActor = await requireResolvedActor(request);
    const result = await createExport({
      confirmFinalIntent: Boolean(body.confirmFinalIntent),
      actorId: resolvedActor.id,
      manuscriptId: body.manuscriptId,
      targetVersionId: body.targetVersionId,
      targetSnapshotRef: body.targetSnapshotRef,
      mode: body.mode
    });
    const status = result.exportPackage.status === "blocked" ? 409 : 200;

    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 409 }
    );
  }
}
