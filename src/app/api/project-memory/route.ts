import { digestProjectMemory, getProjectMemory } from "@/persistence/prisma-workflow-store";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;

  try {
    return NextResponse.json({
      memory: await getProjectMemory(projectId)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project memory lookup failed." },
      { status: 404 }
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string };

  try {
    return NextResponse.json({
      memory: await digestProjectMemory(body.projectId)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project memory digestion failed." },
      { status: 409 }
    );
  }
}
