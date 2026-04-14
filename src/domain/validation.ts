import { z } from "zod";

const memberRoleSchema = z.enum(["owner", "corresponding_author", "coauthor"]);

export const claimInputSchema = z.object({
  manuscriptId: z.string().trim().min(1),
  text: z.string().trim().min(1)
});

export const claimUpdateInputSchema = z.object({
  claimId: z.string().trim().min(1),
  text: z.string().trim().min(1)
});

export const manuscriptInputSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  shortTitle: z.string().optional(),
  abstract: z.string().optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  articleType: z.string().optional(),
  createdBy: z.string().optional()
});

export const evidenceInputSchema = z.object({
  manuscriptId: z.string().trim().min(1),
  evidenceType: z.enum(["figure", "dataset", "table", "method", "citation", "note", "observation"]),
  summary: z.string().trim().min(1),
  linkedClaimIds: z.array(z.string()).optional(),
  confidenceNotes: z.string().optional()
});

export const evidenceUpdateInputSchema = z.object({
  evidenceId: z.string().trim().min(1),
  evidenceType: z.enum(["figure", "dataset", "table", "method", "citation", "note", "observation"]),
  summary: z.string().trim().min(1),
  confidenceNotes: z.string().optional()
});

export const figureInputSchema = z.object({
  manuscriptId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  caption: z.string().trim().min(1),
  figureNumber: z.string().optional(),
  linkedClaimIds: z.array(z.string()).optional(),
  linkedEvidenceIds: z.array(z.string()).optional()
});

export const methodBlockInputSchema = z.object({
  manuscriptId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  protocolType: z.string().optional(),
  linkedClaimIds: z.array(z.string()).optional(),
  linkedFigureIds: z.array(z.string()).optional(),
  reproducibilityNotes: z.string().optional()
});

export const limitationInputSchema = z.object({
  manuscriptId: z.string().trim().min(1),
  text: z.string().trim().min(1),
  scope: z.string().optional(),
  linkedClaimIds: z.array(z.string()).optional(),
  severityOrImportance: z.string().optional()
});

export const citationInputSchema = z.object({
  manuscriptId: z.string().trim().min(1),
  citationKey: z.string().trim().min(1),
  doi: z.string().trim().optional(),
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).min(1),
  journal: z.string().trim().optional(),
  year: z.number().int().optional(),
  volume: z.string().trim().optional(),
  issue: z.string().trim().optional(),
  pages: z.string().trim().optional(),
  url: z.string().trim().optional(),
  linkedClaimIds: z.array(z.string()).optional()
});

export const linkEvidenceInputSchema = z.object({
  claimId: z.string().trim().min(1),
  evidenceId: z.string().trim().min(1),
  manuscriptId: z.string().optional(),
  confirm: z.boolean().optional(),
  notes: z.string().optional(),
  targetVersionId: z.string().optional(),
  targetSnapshotRef: z.string().optional()
});

export const claimEvidenceApprovalInputSchema = z.object({
  claimId: z.string().trim().min(1),
  evidenceId: z.string().trim().min(1),
  notes: z.string().optional(),
  targetVersionId: z.string().optional(),
  targetSnapshotRef: z.string().optional()
});

export const claimMethodApprovalInputSchema = z.object({
  claimId: z.string().trim().min(1),
  methodBlockId: z.string().trim().min(1),
  notes: z.string().optional(),
  targetVersionId: z.string().optional(),
  targetSnapshotRef: z.string().optional()
});

export const claimLimitationApprovalInputSchema = z.object({
  claimId: z.string().trim().min(1),
  limitationId: z.string().trim().min(1),
  notes: z.string().optional(),
  targetVersionId: z.string().optional(),
  targetSnapshotRef: z.string().optional()
});

export const claimApprovalInputSchema = z.object({
  claimId: z.string().trim().min(1),
  notes: z.string().optional(),
  targetVersionId: z.string().optional(),
  targetSnapshotRef: z.string().optional()
});

export const finalIntentApprovalInputSchema = z.object({
  manuscriptId: z.string().trim().min(1),
  notes: z.string().optional(),
  targetVersionId: z.string().optional(),
  targetSnapshotRef: z.string().optional()
});

export const claimValidityInputSchema = z.object({
  manuscriptId: z.string().trim().min(1).optional(),
  claimId: z.string().trim().min(1)
});

export const claimCheckInputSchema = z.object({
  manuscriptId: z.string().trim().min(1).optional(),
  claimId: z.string().trim().min(1)
});

export const supportMappingInputSchema = z.object({
  manuscriptId: z.string().trim().min(1).optional(),
  supportAssetId: z.string().trim().min(1),
  claimId: z.string().trim().min(1),
  status: z.enum(["proposed", "confirmed", "rejected"])
});

export const sectionInputSchema = z.object({
  manuscriptId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  objectRefs: z.array(
    z.object({
      entityType: z.enum(["claim", "figure", "method_block", "citation", "limitation", "text_note"]),
      entityId: z.string().trim().min(1),
      orderIndex: z.number().int().nonnegative(),
      renderHint: z.string().optional()
    })
  ).min(1)
});

export const claimSectionPlacementInputSchema = z
  .object({
    manuscriptId: z.string().trim().min(1),
    claimId: z.string().trim().min(1),
    sectionId: z.string().trim().min(1).optional(),
    sectionTitle: z.string().trim().min(1).optional()
  })
  .refine((value) => Boolean(value.sectionId || value.sectionTitle), {
    message: "Either sectionId or sectionTitle is required.",
    path: ["sectionId"]
  });

export const authorInputSchema = z.object({
  projectId: z.string().optional(),
  manuscriptId: z.string().optional(),
  displayName: z.string().trim().min(1),
  email: z.string().email().optional(),
  orcid: z.string().optional(),
  memberRole: memberRoleSchema.optional(),
  contributorRoles: z.array(z.string().trim().min(1)).optional()
});

export const sessionInputSchema = z.object({
  authorId: z.string().trim().min(1),
  label: z.string().trim().min(1).optional()
});

export const claimDiscussionInputSchema = z.object({
  claimId: z.string().trim().min(1),
  question: z.string().trim().min(1),
  requestedMode: z.enum(["auto", "deterministic", "llm"]).optional()
});
