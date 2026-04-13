import type { Actor, Claim, Evidence, Figure, Limitation, Manuscript, MethodBlock, ResearchObjectGraph, Section } from "./types";

const now = "2026-04-07T08:00:00.000Z";

export const sampleHumanAuthor: Actor = {
  id: "author_001",
  type: "human_author",
  displayName: "Dr. Ada Author"
};

export const sampleAiActor: Actor = {
  id: "ai_reviewer_001",
  type: "ai",
  displayName: "AI First Reviewer"
};

export const sampleManuscript: Manuscript = {
  id: "manuscript_001",
  type: "manuscript",
  projectId: "project_001",
  title: "Structured Evidence Mapping for Scientific Manuscripts",
  shortTitle: "Structured Evidence Mapping",
  abstract: "A sample manuscript used to exercise structured-first authoring workflows.",
  keywords: ["structured publishing", "claims", "evidence"],
  articleType: "research_article",
  submissionStatus: "draft",
  metadata: {
    dataAvailability: "All anonymized example data are available on request.",
    codeAvailability: "Example code will be archived with the final submission.",
    aiAssistanceDisclosure: "AI was used for consistency checks; all claims were human-approved."
  },
  createdBy: sampleHumanAuthor.id,
  createdAt: now,
  updatedAt: now
};

export const sampleClaim: Claim = {
  id: "claim_001",
  type: "claim",
  manuscriptId: sampleManuscript.id,
  text: "Treatment A reduced marker B in the study cohort.",
  claimType: "observation",
  strengthLevel: "moderate",
  status: "draft",
  authorApproved: false,
  publicationReady: false,
  linkedEvidence: [{ evidenceId: "evidence_001", status: "confirmed", confirmedBy: sampleHumanAuthor.id, confirmedAt: now }],
  linkedLimitations: [{ entityId: "limitation_001", status: "confirmed" }],
  linkedCitations: [],
  linkedMethods: [{ entityId: "method_001", status: "confirmed" }],
  sourceFigures: [{ entityId: "figure_001", status: "confirmed" }],
  provenanceIds: [],
  reviewFlagIds: [],
  createdBy: sampleHumanAuthor.id,
  createdAt: now,
  updatedAt: now
};

export const unsupportedClaim: Claim = {
  ...sampleClaim,
  id: "claim_unsupported",
  text: "Treatment A causes durable remission in all patients.",
  claimType: "conclusion",
  strengthLevel: "weak",
  linkedEvidence: [],
  linkedMethods: [],
  linkedLimitations: [],
  sourceFigures: [],
  status: "suggested",
  authorApproved: false,
  publicationReady: false
};

export const sampleEvidence: Evidence = {
  id: "evidence_001",
  type: "evidence",
  manuscriptId: sampleManuscript.id,
  evidenceType: "figure",
  summary: "Figure 1 shows marker B reduction after Treatment A.",
  linkedAssetIds: ["asset_001"],
  linkedClaimIds: [sampleClaim.id],
  confidenceNotes: "Cohort size is limited.",
  provenanceIds: [],
  createdBy: sampleHumanAuthor.id,
  createdAt: now,
  updatedAt: now
};

export const sampleFigure: Figure = {
  id: "figure_001",
  type: "figure",
  manuscriptId: sampleManuscript.id,
  figureNumber: "1",
  title: "Marker B response after Treatment A",
  caption: "Marker B decreases after Treatment A in the study cohort.",
  uploadedAssetIds: ["asset_001"],
  rawDataLinkIds: ["dataset_001"],
  linkedClaimIds: [sampleClaim.id],
  linkedEvidenceIds: [sampleEvidence.id],
  linkedMethodBlockIds: ["method_001"],
  status: "draft",
  createdBy: sampleHumanAuthor.id,
  createdAt: now,
  updatedAt: now
};

export const sampleMethod: MethodBlock = {
  id: "method_001",
  type: "method_block",
  manuscriptId: sampleManuscript.id,
  title: "Marker B quantification",
  content:
    "Marker B was quantified from prepared cohort samples using a pre-specified assay protocol with batch controls, duplicate measurements, and blinded normalization before group-level comparison.",
  protocolType: "assay",
  linkedClaimIds: [sampleClaim.id],
  linkedFigureIds: [sampleFigure.id],
  reproducibilityNotes: "Assay controls and normalization parameters are captured in the supplementary protocol.",
  status: "draft",
  createdBy: sampleHumanAuthor.id,
  createdAt: now,
  updatedAt: now
};

export const sampleSection: Section = {
  id: "section_001",
  type: "section",
  manuscriptId: sampleManuscript.id,
  title: "Results",
  orderIndex: 1,
  objectRefs: [
    { entityType: "claim", entityId: sampleClaim.id, orderIndex: 1 },
    { entityType: "figure", entityId: sampleFigure.id, orderIndex: 2 }
  ],
  status: "draft",
  createdBy: sampleHumanAuthor.id,
  createdAt: now,
  updatedAt: now
};

export const sampleLimitation: Limitation = {
  id: "limitation_001",
  type: "limitation",
  manuscriptId: sampleManuscript.id,
  text: "The example cohort is small and may not generalize to every population.",
  linkedClaimIds: [sampleClaim.id],
  status: "draft",
  createdBy: sampleHumanAuthor.id,
  createdAt: now,
  updatedAt: now
};

export const sampleGraph: ResearchObjectGraph = {
  manuscript: sampleManuscript,
  sections: [sampleSection],
  claims: [sampleClaim],
  evidence: [sampleEvidence],
  figures: [sampleFigure],
  methods: [sampleMethod],
  citations: [],
  limitations: [sampleLimitation],
  approvals: [],
  provenance: [],
  auditLogs: [],
  versions: [],
  authors: [
    {
      id: sampleHumanAuthor.id,
      type: "author",
      projectId: sampleManuscript.projectId,
      displayName: sampleHumanAuthor.displayName,
      orcid: "0000-0000-0000-0000"
    }
  ],
  aiReviewResults: [],
  validityAssessments: [],
  datasets: [{ id: "dataset_001", title: "Marker B source data" }],
  softwareArtifacts: [{ id: "software_001", name: "Marker B analysis notebook" }]
};
