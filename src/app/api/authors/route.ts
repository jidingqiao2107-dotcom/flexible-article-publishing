import { authorInputSchema } from "@/domain/validation";
import { createAuthor, listAuthors } from "@/persistence/runtime-store";
import { requireResolvedActor } from "@/server/identity";
import { NextResponse } from "next/server";

function assertDevelopmentOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Author creation through this route is disabled in production.");
  }
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  return NextResponse.json({ authors: await listAuthors(projectId) });
}

export async function POST(request: Request) {
  const parseResult = authorInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    assertDevelopmentOnly();
    const actor = await requireResolvedActor(request);
    return NextResponse.json({ author: await createAuthor({ ...parseResult.data, createdBy: actor.id }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Author creation failed." }, { status: 409 });
  }
}
