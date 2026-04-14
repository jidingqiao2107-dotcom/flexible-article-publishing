import { sessionInputSchema } from "@/domain/validation";
import { getActorMembershipContext } from "@/persistence/runtime-store";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  clearSessionByToken,
  createDevelopmentSession,
  getSessionTokenFromRequest,
  requireResolvedActor
} from "@/server/identity";
import { NextResponse } from "next/server";

function assertDevelopmentOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development session creation is disabled in production.");
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireResolvedActor(request);
    const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
    const membership = await getActorMembershipContext(actor.id, manuscriptId);
    return NextResponse.json({ actor, membership });
  } catch {
    return NextResponse.json({ actor: null }, { status: 401 });
  }
}

export async function POST(request: Request) {
  const parseResult = sessionInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    assertDevelopmentOnly();
    const session = await createDevelopmentSession(parseResult.data);
    const response = NextResponse.json({ actor: session.actor, sessionId: session.sessionId });
    response.headers.set("Set-Cookie", buildSessionCookie(session.token));
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Session creation failed." },
      { status: 409 }
    );
  }
}

export async function DELETE(request: Request) {
  await clearSessionByToken(getSessionTokenFromRequest(request));
  const response = NextResponse.json({ cleared: true });
  response.headers.set("Set-Cookie", buildExpiredSessionCookie());
  return response;
}
