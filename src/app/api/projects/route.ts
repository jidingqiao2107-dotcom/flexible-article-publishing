import { createProject, listProjects } from "@/persistence/runtime-store";
import { NextResponse } from "next/server";
import { z } from "zod";

const projectInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  createdBy: z.string().optional()
});

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(request: Request) {
  const parseResult = projectInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ project: await createProject(parseResult.data) });
}
