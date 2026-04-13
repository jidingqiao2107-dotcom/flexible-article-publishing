import { answerProjectDiscussion } from "@/persistence/prisma-workflow-store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    question?: string;
    claimIds?: string[];
  };

  if (!body.question?.trim()) {
    return NextResponse.json({ error: "A grounded discussion question is required." }, { status: 400 });
  }

  try {
    return NextResponse.json({
      answer: await answerProjectDiscussion({
        projectId: body.projectId,
        question: body.question,
        claimIds: body.claimIds
      })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grounded discussion failed." },
      { status: 409 }
    );
  }
}
