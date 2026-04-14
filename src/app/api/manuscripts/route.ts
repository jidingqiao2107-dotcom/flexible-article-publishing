import { getExportReadiness } from "@/domain/policies";
import { manuscriptInputSchema } from "@/domain/validation";
import { getManuscriptTrustReadiness } from "@/domain/trust";
import { createManuscript, getResearchObjectGraph, listManuscripts } from "@/persistence/runtime-store";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const manuscriptId = url.searchParams.get("manuscriptId") ?? undefined;
  const projectId = url.searchParams.get("projectId") ?? undefined;

  try {
    if (!manuscriptId) {
      return NextResponse.json({
        manuscripts: await listManuscripts(projectId)
      });
    }

    const graph = await getResearchObjectGraph(manuscriptId);
    const exportReadiness = getExportReadiness(graph);
    const manuscriptTrustReadiness = getManuscriptTrustReadiness(graph);

    return NextResponse.json({
      manuscript: graph.manuscript,
      sections: graph.sections,
      claims: graph.claims,
      evidence: graph.evidence,
      supportAssets: graph.supportAssets,
      figures: graph.figures,
      methods: graph.methods,
      citations: graph.citations,
      limitations: graph.limitations,
      approvals: graph.approvals,
      auditLogs: graph.auditLogs,
      aiReviewResults: graph.aiReviewResults,
      validityAssessments: graph.validityAssessments,
      claimFramingAssessments: graph.claimFramingAssessments,
      claimTrustReadiness: graph.claimTrustReadiness,
      manuscriptTrustReadiness,
      authors: graph.authors,
      projectMembers: graph.projectMembers,
      manuscriptMembers: graph.manuscriptMembers,
      exportReadiness
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Manuscript lookup failed." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const parseResult = manuscriptInputSchema.safeParse(await request.json());

  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json({ manuscript: await createManuscript(parseResult.data) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manuscript creation failed." },
      { status: 409 }
    );
  }
}
