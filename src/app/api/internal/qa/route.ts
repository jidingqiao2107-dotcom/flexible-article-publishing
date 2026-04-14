import { createDevelopmentSession, buildSessionCookie } from "@/server/identity";
import { resetDevelopmentQaData, seedDevelopmentQaScenario } from "@/persistence/runtime-store";
import { NextResponse } from "next/server";

function assertDevelopmentOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Internal QA helpers are disabled in production.");
  }
}

export async function POST(request: Request) {
  try {
    assertDevelopmentOnly();
    const body = (await request.json().catch(() => ({}))) as { action?: "reset" | "seed" | "bootstrap" };

    if (body.action === "reset") {
      await resetDevelopmentQaData();
      return NextResponse.json({ ok: true, action: "reset" });
    }

    if (body.action === "seed" || body.action === "bootstrap") {
      const seeded = await seedDevelopmentQaScenario();
      const response = NextResponse.json({
        ok: true,
        action: body.action,
        project: seeded.project,
        manuscript: seeded.manuscript,
        authors: {
          owner: seeded.owner,
          correspondingAuthor: seeded.correspondingAuthor,
          coauthor: seeded.coauthor
        }
      });

      if (body.action === "bootstrap") {
        const session = await createDevelopmentSession({
          authorId: seeded.correspondingAuthor.id,
          label: "qa-bootstrap-session"
        });
        response.headers.set("Set-Cookie", buildSessionCookie(session.token));
      }

      return response;
    }

    return NextResponse.json({ error: "Unsupported QA action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "QA helper failed." },
      { status: 409 }
    );
  }
}
