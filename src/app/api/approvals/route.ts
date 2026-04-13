import {
  claimApprovalInputSchema,
  claimEvidenceApprovalInputSchema,
  claimLimitationApprovalInputSchema,
  claimMethodApprovalInputSchema,
  finalIntentApprovalInputSchema
} from "@/domain/validation";
import {
  addFinalIntentApproval,
  approveClaimEvidenceLink,
  approveClaimLimitationLink,
  approveClaimMethodLink,
  approveClaim,
  markClaimPublicationReady
} from "@/persistence/prisma-workflow-store";
import { assertNoActorOverride, requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    approvalType?:
      | "claim_approval"
      | "claim_evidence_approval"
      | "claim_method_approval"
      | "claim_limitation_approval"
      | "claim_publication_ready"
      | "pre_export_intent_confirmation";
    targetEntityId?: string;
    evidenceId?: string;
    methodBlockId?: string;
    limitationId?: string;
    notes?: string;
    targetVersionId?: string;
    targetSnapshotRef?: string;
  };

  try {
    assertNoActorOverride(body);

    if (body.approvalType === "claim_approval" && body.targetEntityId) {
      const actor = await requireResolvedActor(request);
      const parseResult = claimApprovalInputSchema.safeParse({
        claimId: body.targetEntityId,
        notes: body.notes,
        targetVersionId: body.targetVersionId,
        targetSnapshotRef: body.targetSnapshotRef
      });

      if (!parseResult.success) {
        return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
      }

      return NextResponse.json(
        await approveClaim(parseResult.data.claimId, actor.id, {
          notes: parseResult.data.notes,
          targetVersionId: parseResult.data.targetVersionId,
          targetSnapshotRef: parseResult.data.targetSnapshotRef
        })
      );
    }

    if (body.approvalType === "claim_evidence_approval") {
      const actor = await requireResolvedActor(request);
      const parseResult = claimEvidenceApprovalInputSchema.safeParse({
        claimId: body.targetEntityId,
        evidenceId: body.evidenceId,
        notes: body.notes,
        targetVersionId: body.targetVersionId,
        targetSnapshotRef: body.targetSnapshotRef
      });

      if (!parseResult.success) {
        return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
      }

      return NextResponse.json(
        await approveClaimEvidenceLink({
          ...parseResult.data,
          actorId: actor.id
        })
      );
    }

    if (body.approvalType === "claim_method_approval") {
      const actor = await requireResolvedActor(request);
      const parseResult = claimMethodApprovalInputSchema.safeParse({
        claimId: body.targetEntityId,
        methodBlockId: body.methodBlockId,
        notes: body.notes,
        targetVersionId: body.targetVersionId,
        targetSnapshotRef: body.targetSnapshotRef
      });

      if (!parseResult.success) {
        return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
      }

      return NextResponse.json(
        await approveClaimMethodLink({
          ...parseResult.data,
          actorId: actor.id
        })
      );
    }

    if (body.approvalType === "claim_limitation_approval") {
      const actor = await requireResolvedActor(request);
      const parseResult = claimLimitationApprovalInputSchema.safeParse({
        claimId: body.targetEntityId,
        limitationId: body.limitationId,
        notes: body.notes,
        targetVersionId: body.targetVersionId,
        targetSnapshotRef: body.targetSnapshotRef
      });

      if (!parseResult.success) {
        return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
      }

      return NextResponse.json(
        await approveClaimLimitationLink({
          ...parseResult.data,
          actorId: actor.id
        })
      );
    }

    if (body.approvalType === "claim_publication_ready" && body.targetEntityId) {
      const actor = await requireResolvedActor(request);
      return NextResponse.json({ claim: await markClaimPublicationReady(body.targetEntityId, actor.id) });
    }

    if (body.approvalType === "pre_export_intent_confirmation") {
      const actor = await requireResolvedActor(request);
      const parseResult = finalIntentApprovalInputSchema.safeParse({
        manuscriptId: body.targetEntityId,
        notes: body.notes,
        targetVersionId: body.targetVersionId,
        targetSnapshotRef: body.targetSnapshotRef
      });

      if (!parseResult.success) {
        return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
      }

      return NextResponse.json({
        approvalEvent: await addFinalIntentApproval({
          ...parseResult.data,
          actorId: actor.id
        })
      });
    }

    return NextResponse.json({ error: "Unsupported approval request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval failed." }, { status: 409 });
  }
}
