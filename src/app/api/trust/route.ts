import { getClaimTrustContracts, getManuscriptTrustContract } from "@/persistence/prisma-workflow-store";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const manuscriptId = url.searchParams.get("manuscriptId") ?? undefined;
  const claimId = url.searchParams.get("claimId") ?? undefined;

  try {
    const manuscriptTrustReadiness = await getManuscriptTrustContract(manuscriptId);
    const claimTrustReadiness = claimId
      ? manuscriptTrustReadiness.claimTrustReadiness.filter((item) => item.claimId === claimId)
      : await getClaimTrustContracts(manuscriptId);

    return NextResponse.json({
      manuscriptTrustReadiness,
      claimTrustReadiness
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trust/readiness lookup failed." },
      { status: 404 }
    );
  }
}
