import { claimCheckInputSchema } from "@/domain/validation";
import { getClaimCheckResult, runClaimCheck } from "@/persistence/runtime-store";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const manuscriptId = url.searchParams.get("manuscriptId") ?? undefined;
  const claimId = url.searchParams.get("claimId") ?? undefined;

  const parseResult = claimCheckInputSchema.safeParse({ manuscriptId, claimId });

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json({
      result: await getClaimCheckResult(parseResult.data)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claim check lookup failed." },
      { status: 409 }
    );
  }
}

export async function POST(request: Request) {
  const parseResult = claimCheckInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json({
      result: await runClaimCheck(parseResult.data)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claim check failed." },
      { status: 409 }
    );
  }
}
