import { createEvidence, createFigure, createSupportAsset, listSupportAssets } from "@/persistence/runtime-store";
import { requireResolvedActor } from "@/server/identity";
import { isPreviewMode } from "@/server/runtime-mode";
import { persistSupportUpload } from "@/server/support-assets";
import { NextResponse } from "next/server";

function guessFigureTitle(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Uploaded figure";
}

function guessEvidenceSummary(fileName: string, supportCategory: "data" | "text", textPreview?: string) {
  if (textPreview) {
    const firstLine = textPreview.split(/\r?\n/)[0]?.trim();
    if (firstLine) {
      return supportCategory === "data" ? `Uploaded dataset preview: ${firstLine}` : firstLine;
    }
  }

  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base ? `Uploaded ${supportCategory} support: ${base}` : `Uploaded ${supportCategory} support`;
}

export async function GET(request: Request) {
  const manuscriptId = new URL(request.url).searchParams.get("manuscriptId") ?? undefined;
  return NextResponse.json({ supportAssets: await listSupportAssets(manuscriptId) });
}

export async function POST(request: Request) {
  try {
    if (!isPreviewMode()) {
      return NextResponse.json(
        { error: "Support uploads are currently available in founder preview mode only." },
        { status: 409 }
      );
    }

    const actor = await requireResolvedActor(request);
    const formData = await request.formData();
    const manuscriptId = formData.get("manuscriptId");
    const uploadedFile = formData.get("file");
    const title = (formData.get("title") ?? "").toString().trim();
    const caption = (formData.get("caption") ?? "").toString().trim();
    const summary = (formData.get("summary") ?? "").toString().trim();

    if (typeof manuscriptId !== "string" || !manuscriptId.trim()) {
      return NextResponse.json({ error: "manuscriptId is required." }, { status: 400 });
    }

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json({ error: "A support file is required." }, { status: 400 });
    }

    const persistedFile = await persistSupportUpload({ file: uploadedFile });

    if (persistedFile.supportCategory === "image") {
      const figure = await createFigure({
        manuscriptId,
        title: title || guessFigureTitle(persistedFile.originalFilename),
        caption: caption || `Uploaded image support from ${persistedFile.originalFilename}.`,
        createdBy: actor.id
      });
      const supportAsset = await createSupportAsset({
        manuscriptId,
        supportCategory: persistedFile.supportCategory,
        fileType: persistedFile.fileType,
        originalFilename: persistedFile.originalFilename,
        storageKey: persistedFile.storageKey,
        publicUrl: persistedFile.publicUrl,
        sizeBytes: persistedFile.sizeBytes,
        contentDigest: persistedFile.contentDigest,
        textPreview: persistedFile.textPreview,
        extractedText: persistedFile.extractedText,
        derivedEntityType: "figure",
        derivedEntityId: figure.id,
        createdBy: actor.id
      });

      return NextResponse.json({ supportAsset, figure });
    }

    const evidence = await createEvidence({
      manuscriptId,
      evidenceType: persistedFile.supportCategory === "data" ? "dataset" : "note",
      summary: summary || guessEvidenceSummary(persistedFile.originalFilename, persistedFile.supportCategory, persistedFile.textPreview),
      confidenceNotes:
        persistedFile.supportCategory === "data"
          ? "Uploaded dataset file for claim checking."
          : "Uploaded text support file for claim checking.",
      createdBy: actor.id
    });
    const supportAsset = await createSupportAsset({
      manuscriptId,
      supportCategory: persistedFile.supportCategory,
      fileType: persistedFile.fileType,
      originalFilename: persistedFile.originalFilename,
      storageKey: persistedFile.storageKey,
      publicUrl: persistedFile.publicUrl,
      sizeBytes: persistedFile.sizeBytes,
      contentDigest: persistedFile.contentDigest,
      textPreview: persistedFile.textPreview,
      extractedText: persistedFile.extractedText,
      derivedEntityType: "evidence",
      derivedEntityId: evidence.id,
      createdBy: actor.id
    });

    return NextResponse.json({ supportAsset, evidence });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Support upload failed." },
      { status: 409 }
    );
  }
}
