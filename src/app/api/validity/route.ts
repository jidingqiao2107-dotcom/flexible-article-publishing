import { claimValidityInputSchema } from "@/domain/validation";
import { assessClaimValidity, listLatestClaimValidityAssessments } from "@/persistence/runtime-store";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const manuscriptId = url.searchParams.get("manuscriptId") ?? undefined;
  const claimId = url.searchParams.get("claimId") ?? undefined;

  try {
    return NextResponse.json({
      validityAssessments: await listLatestClaimValidityAssessments({ manuscriptId, claimId })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Validity lookup failed." },
      { status: 404 }
    );
  }
}

export async function POST(request: Request) {
  const parseResult = claimValidityInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json({
      validityAssessment: await assessClaimValidity(parseResult.data)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Validity assessment failed." },
      { status: 409 }
    );
  }
}
