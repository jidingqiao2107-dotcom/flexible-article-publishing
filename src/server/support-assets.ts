import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const DEMO_UPLOAD_DIR = path.join(process.cwd(), "public", "demo-support-assets");

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function inferSupportCategory(fileName: string, mimeType: string) {
  const lowered = fileName.toLowerCase();

  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(lowered)) {
    return "image" as const;
  }

  if (mimeType.includes("csv") || lowered.endsWith(".csv")) {
    return "data" as const;
  }

  if (mimeType.startsWith("text/") || lowered.endsWith(".txt")) {
    return "text" as const;
  }

  throw new Error("Only image, CSV, and TXT support files are accepted right now.");
}

function parseCsvPreview(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("CSV upload is empty.");
  }

  const rows = trimmed
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    throw new Error("CSV upload needs a header row and at least one data row.");
  }

  const delimiter = rows[0].includes(",") ? "," : rows[0].includes("\t") ? "\t" : null;

  if (!delimiter) {
    throw new Error("CSV upload must contain comma- or tab-separated columns.");
  }

  const headerWidth = rows[0].split(delimiter).length;

  if (headerWidth < 2) {
    throw new Error("CSV upload needs at least two columns.");
  }

  const malformed = rows.slice(1).some((row) => row.split(delimiter).length !== headerWidth);

  if (malformed) {
    throw new Error("CSV upload has inconsistent column counts.");
  }

  return rows.slice(0, 4).join("\n");
}

export async function persistSupportUpload(input: {
  file: File;
}): Promise<{
  supportCategory: "image" | "data" | "text";
  fileType: string;
  originalFilename: string;
  storageKey: string;
  publicUrl: string;
  sizeBytes: number;
  contentDigest: string;
  extractedText?: string;
  textPreview?: string;
}> {
  const originalFilename = input.file.name || "uploaded-support";
  const fileType = input.file.type || "application/octet-stream";
  const supportCategory = inferSupportCategory(originalFilename, fileType);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const contentDigest = createHash("sha256").update(buffer).digest("hex");
  const extension = path.extname(originalFilename) || (supportCategory === "image" ? ".png" : supportCategory === "data" ? ".csv" : ".txt");
  const storageKey = `${Date.now()}_${sanitizeSegment(path.basename(originalFilename, extension))}_${contentDigest.slice(0, 8)}${extension}`;

  let extractedText: string | undefined;
  let textPreview: string | undefined;

  if (supportCategory === "data" || supportCategory === "text") {
    extractedText = buffer.toString("utf8");

    if (supportCategory === "data") {
      textPreview = parseCsvPreview(extractedText);
    } else {
      const trimmed = extractedText.trim();
      if (!trimmed) {
        throw new Error("TXT upload is empty.");
      }
      textPreview = trimmed.slice(0, 600);
    }
  }

  await mkdir(DEMO_UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(DEMO_UPLOAD_DIR, storageKey), buffer);

  return {
    supportCategory,
    fileType,
    originalFilename,
    storageKey,
    publicUrl: `/demo-support-assets/${storageKey}`,
    sizeBytes: buffer.byteLength,
    contentDigest,
    extractedText,
    textPreview
  };
}
