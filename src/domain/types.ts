export type EntityId = string;

export type ActorType =
  | "human_author"
  | "ai"
  | "system"
  | "internal_reviewer"
  | "external_reviewer";

export type Actor = {
  id: EntityId;
  type: ActorType;
  displayName: string;
};

export type ClaimStatus =
  | "draft"
  | "suggested"
  | "needs_revision"
  | "approved"
  | "publication_ready"
  | "blocked";

export type ClaimType =
  | "observation"
  | "interpretation"
  | "mechanism"
  | "hypothesis"
  | "conclusion"
  | "background";

export type StrengthLevel = "weak" | "moderate" | "strong" | "exploratory";

export type LinkStatus = "proposed" | "confirmed" | "rejected";
export type SupportCategory = "image" | "data" | "text";

export type ReviewSeverity = "info" | "warning" | "blocking";
export type ValidityScoreBand = "insufficient" | "weak" | "moderate" | "strong" | "high";
export type ClaimValidityFreshnessStatus = "current" | "partially_stale" | "stale";
export type DiscussionRequestedMode = "auto" | "deterministic" | "llm";
export type DiscussionSourceMode = "deterministic_discussion_contract_v1" | "llm_openai_responses_v1";
export type ClaimFramingSourceMode = "deterministic_claim_framing_v1" | "llm_claim_framing_v1";
export type ClaimTrustLifecycleState =
  | "draft"
  | "under_review"
  | "blocked"
  | "human_approved"
  | "publication_ready"
  | "stale_reapproval_required";
export type ClaimAiReviewStatus =
  | "not_run"
  | "completed_current"
  | "completed_with_blocking_findings"
  | "stale_rerun_required";
export type ClaimHumanApprovalStatus = "missing" | "approved_current" | "stale_reapproval_required";
export type ClaimFinalIntentStatus = "not_confirmed" | "confirmed_current" | "stale_reconfirmation_required";

export type ReviewResolutionStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed_by_author";

export type ApprovalType =
  | "claim_approval"
  | "claim_evidence_approval"
  | "claim_method_approval"
  | "claim_limitation_approval"
  | "pre_export_intent_confirmation"
  | "ai_edit_acceptance"
  | "review_resolution";

export type ExportStatus = "draft" | "blocked" | "ready" | "generated" | "superseded";
export type ExportMode = "draft_internal" | "publication_intent";
export type MemberRole = "owner" | "corresponding_author" | "coauthor";
export type SourceClassification = "human" | "ai_suggestion" | "system";

export type AuditLog = {
  id: EntityId;
  type: "audit_log";
  projectId?: EntityId;
  manuscriptId?: EntityId;
  actorType: ActorType;
  actorId: EntityId;
  sourceClassification: SourceClassification;
  action: string;
  targetEntityType: string;
  targetEntityId: EntityId;
  targetVersionId?: EntityId;
  targetSnapshotRef?: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  context?: Record<string, unknown>;
  createdAt: string;
};

export type BaseEntity = {
  id: EntityId;
  type: string;
  manuscriptId?: EntityId;
  createdBy: EntityId;
  createdAt: string;
  updatedAt?: string;
  versionId?: EntityId;
};

export type ClaimEvidenceLink = {
  evidenceId: EntityId;
  status: LinkStatus;
  confirmedBy?: EntityId;
  confirmedAt?: string;
};

export type EntityLink = {
  entityId: EntityId;
  status: LinkStatus;
};

export type Claim = BaseEntity & {
  type: "claim";
  manuscriptId: EntityId;
  text: string;
  claimType: ClaimType;
  strengthLevel: StrengthLevel;
  status: ClaimStatus;
  authorApproved: boolean;
  publicationReady: boolean;
  linkedEvidence: ClaimEvidenceLink[];
  linkedLimitations: EntityLink[];
  linkedCitations: EntityLink[];
  linkedMethods: EntityLink[];
  sourceFigures: EntityLink[];
  provenanceIds: EntityId[];
  reviewFlagIds: EntityId[];
};

export type Evidence = BaseEntity & {
  type: "evidence";
  manuscriptId: EntityId;
  evidenceType: "figure" | "dataset" | "table" | "method" | "citation" | "note" | "observation";
  summary: string;
  linkedAssetIds: EntityId[];
  linkedClaimIds: EntityId[];
  confidenceNotes?: string;
  provenanceIds: EntityId[];
};

export type SupportAssetClaimLink = {
  claimId: EntityId;
  status: LinkStatus;
  linkedEntityType: "evidence" | "figure";
  linkedEntityId: EntityId;
};

export type SupportAsset = BaseEntity & {
  type: "support_asset";
  manuscriptId: EntityId;
  supportCategory: SupportCategory;
  fileType: string;
  originalFilename: string;
  storageKey: string;
  publicUrl?: string;
  sizeBytes: number;
  contentDigest: string;
  extractedText?: string;
  textPreview?: string;
  linkedClaimIds: EntityId[];
  claimLinks: SupportAssetClaimLink[];
  derivedEntityType: "evidence" | "figure";
  derivedEntityId: EntityId;
  status: "available" | "removed";
};

export type Figure = BaseEntity & {
  type: "figure";
  manuscriptId: EntityId;
  figureNumber?: string;
  title: string;
  caption: string;
  panelStructure?: Record<string, unknown>;
  uploadedAssetIds: EntityId[];
  rawDataLinkIds: EntityId[];
  linkedClaimIds: EntityId[];
  linkedEvidenceIds: EntityId[];
  linkedMethodBlockIds: EntityId[];
  status: string;
};

export type MethodBlock = BaseEntity & {
  type: "method_block";
  manuscriptId: EntityId;
  title: string;
  content: string;
  protocolType?: string;
  linkedClaimIds: EntityId[];
  linkedFigureIds: EntityId[];
  reproducibilityNotes?: string;
  status: string;
};

export type Citation = BaseEntity & {
  type: "citation";
  manuscriptId: EntityId;
  citationKey: string;
  doi?: string;
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  linkedClaimIds: EntityId[];
  linkedSectionIds: EntityId[];
};

export type Limitation = BaseEntity & {
  type: "limitation";
  manuscriptId: EntityId;
  text: string;
  scope?: string;
  linkedClaimIds: EntityId[];
  severityOrImportance?: string;
  status: string;
};

export type SectionObjectRef = {
  entityType: "claim" | "figure" | "method_block" | "citation" | "limitation" | "text_note";
  entityId: EntityId;
  orderIndex: number;
  renderHint?: string;
};

export type Section = BaseEntity & {
  type: "section";
  manuscriptId: EntityId;
  title: string;
  orderIndex: number;
  objectRefs: SectionObjectRef[];
  status: string;
};

export type Manuscript = BaseEntity & {
  type: "manuscript";
  projectId: EntityId;
  title: string;
  shortTitle?: string;
  abstract?: string;
  keywords: string[];
  articleType?: string;
  submissionStatus: string;
  metadata: {
    acknowledgements?: string;
    conflictsOfInterest?: string[];
    ethicsStatements?: string[];
    funding?: string[];
    dataAvailability?: string;
    codeAvailability?: string;
    license?: string;
    persistentIdentifiers?: string[];
    preprintIdentifiers?: string[];
    journalTarget?: string;
    aiAssistanceDisclosure?: string;
    supplementaryInformationMapping?: Record<string, unknown>;
  };
};

export type Project = BaseEntity & {
  type: "project";
  name: string;
  description?: string;
};

export type ApprovalEvent = {
  id: EntityId;
  type: "approval_event";
  manuscriptId: EntityId;
  approvalType: ApprovalType;
  actorType: ActorType;
  actorId: EntityId;
  sourceClassification: SourceClassification;
  targetEntityType: string;
  targetEntityId: EntityId;
  targetVersionId?: EntityId;
  targetSnapshotRef?: string;
  approved: boolean;
  notes?: string;
  createdAt: string;
};

export type ProvenanceRecord = {
  id: EntityId;
  type: "provenance_record";
  manuscriptId: EntityId;
  targetEntityType: string;
  targetEntityId: EntityId;
  sourceObjectIds: EntityId[];
  modelActionType?: string;
  preVersionId?: EntityId;
  postVersionId?: EntityId;
  authorApprovalStatus: "pending" | "approved" | "rejected" | "overridden";
  createdAt: string;
};

export type AIReviewResult = {
  id: EntityId;
  type: "ai_review_result";
  manuscriptId: EntityId;
  ruleId: string;
  severity: ReviewSeverity;
  message: string;
  linkedEntityIds: EntityId[];
  recommendedAction: string;
  resolutionStatus: ReviewResolutionStatus;
  modelActionType: "deterministic_rule_check" | "llm_review";
  createdAt: string;
};

export type ClaimValidityDimension = {
  score: number;
  rationale: string;
  drivers: string[];
};

export type ClaimValidityAssessment = {
  assessmentId: EntityId;
  type: "claim_validity_assessment";
  manuscriptId: EntityId;
  claimId: EntityId;
  overallValidityScore: number;
  scoreBand: ValidityScoreBand;
  summaryForUser: string;
  majorConcerns: string[];
  suggestedNextActions: string[];
  biggestScoreDrivers: string[];
  expandableDimensions: {
    supportStrength: ClaimValidityDimension;
    statementFit: ClaimValidityDimension;
    evidenceCoverage: ClaimValidityDimension;
    methodAdequacy: ClaimValidityDimension;
    limitationImpact: ClaimValidityDimension;
    alternativeExplanationPressure: ClaimValidityDimension;
    integratedAssessment: ClaimValidityDimension;
  };
  modelConfidence: number;
  generatedAt: string;
  sourceMode: "deterministic_validity_contract_v1" | "llm_validity_contract";
  basedOnLinkedObjectIds: EntityId[];
  basedOnSnapshotRef: string;
  basedOnSnapshot: Record<string, unknown>;
  stale: boolean;
  freshnessStatus: ClaimValidityFreshnessStatus;
  staleReasons: string[];
};

export type ClaimTrustIssue = {
  code: string;
  message: string;
  scope: "claim" | "manuscript";
  affects: Array<"draft_internal_export" | "publication_export" | "publication_readiness" | "lifecycle" | "ai_review" | "human_approval">;
};

export type ClaimApprovalReference = {
  approvalEventId: EntityId;
  approvedAt: string;
  targetSnapshotRef?: string;
  actorId: EntityId;
};

export type ClaimTrustReadiness = {
  claimId: EntityId;
  lifecycleState: ClaimTrustLifecycleState;
  aiReviewStatus: ClaimAiReviewStatus;
  humanApprovalStatus: ClaimHumanApprovalStatus;
  blockers: ClaimTrustIssue[];
  warnings: ClaimTrustIssue[];
  stale: boolean;
  staleReasons: string[];
  exportEligibility: "not_exportable" | "draft_internal_only" | "publication_intent";
  exportModeEligibility: {
    draftInternalShare: {
      eligible: boolean;
      blockingReasons: string[];
      warningReasons: string[];
    };
    publicationIntent: {
      eligible: boolean;
      blockingReasons: string[];
      warningReasons: string[];
    };
  };
  publicationReadiness: {
    ready: boolean;
    reasons: string[];
  };
  finalIntentStatus: ClaimFinalIntentStatus;
  lastHumanApprovalRef?: ClaimApprovalReference;
  basedOnLinkedObjectIds: EntityId[];
  basedOnSnapshotRef: string;
  updatedAt: string;
};

export type ManuscriptTrustReadiness = {
  manuscriptId: EntityId;
  finalIntentStatus: ClaimFinalIntentStatus;
  claimTrustReadiness: ClaimTrustReadiness[];
  exportModeEligibility: {
    draftInternalShare: {
      eligible: boolean;
      blockingReasons: string[];
      warningReasons: string[];
    };
    publicationIntent: {
      eligible: boolean;
      blockingReasons: string[];
      warningReasons: string[];
    };
  };
};

export type Version = {
  id: EntityId;
  type: "version";
  manuscriptId: EntityId;
  parentVersionId?: EntityId;
  createdBy: EntityId;
  createdAt: string;
  changeSummary: string;
  snapshotPointer: string;
};

export type ExportPackage = {
  id: EntityId;
  type: "export_package";
  manuscriptId: EntityId;
  exportType: "docx_placeholder" | "docx" | "latex" | "pdf" | "reviewer_packet" | "structured_json";
  status: ExportStatus;
  versionId?: EntityId;
  finalApprovalEventId?: EntityId;
  snapshotPointer?: string;
  artifactPointer?: string;
  readinessReport: ExportReadinessReport;
  createdBy: EntityId;
  createdAt: string;
};

export type ExportReadinessReport = {
  canExport: boolean;
  blockingReasons: string[];
  warnings: string[];
};

export type ResearchObjectGraph = {
  manuscript: Manuscript;
  sections: Section[];
  claims: Claim[];
  evidence: Evidence[];
  supportAssets?: SupportAsset[];
  figures: Figure[];
  methods: MethodBlock[];
  citations: Citation[];
  limitations: Limitation[];
  approvals: ApprovalEvent[];
  provenance: ProvenanceRecord[];
  auditLogs?: AuditLog[];
  versions?: Version[];
  authors?: Author[];
  projectMembers?: ProjectMember[];
  manuscriptMembers?: ManuscriptMember[];
  aiReviewResults: AIReviewResult[];
  validityAssessments?: ClaimValidityAssessment[];
  claimFramingAssessments?: ClaimFramingAssessment[];
  claimTrustReadiness?: ClaimTrustReadiness[];
  datasets?: Array<{ id: EntityId; title: string }>;
  softwareArtifacts?: Array<{ id: EntityId; name: string }>;
};

export type Author = {
  id: EntityId;
  type: "author";
  projectId: EntityId;
  displayName: string;
  email?: string;
  orcid?: string;
};

export type Affiliation = {
  id: EntityId;
  type: "affiliation";
  name: string;
  address?: string;
  country?: string;
};

export type ManuscriptAuthor = {
  id: EntityId;
  manuscriptId: EntityId;
  authorId: EntityId;
  contributorRoles: string[];
  isCorrespondingAuthor: boolean;
  orderIndex: number;
};

export type ProjectMember = {
  id: EntityId;
  projectId: EntityId;
  authorId: EntityId;
  role: MemberRole;
  addedBy?: EntityId;
  createdAt: string;
};

export type ManuscriptMember = {
  id: EntityId;
  manuscriptId: EntityId;
  authorId: EntityId;
  role: MemberRole;
  addedBy?: EntityId;
  createdAt: string;
};

export type ManuscriptInput = {
  projectId: EntityId;
  title: string;
  shortTitle?: string;
  abstract?: string;
  keywords?: string[];
  articleType?: string;
  createdBy?: EntityId;
};

export type ProjectMemoryClaimAnalysis = {
  claimId: EntityId;
  manuscriptId: EntityId;
  manuscriptTitle: string;
  claimText: string;
  claimType: ClaimType;
  strengthLevel: StrengthLevel;
  authorConfirmed: boolean;
  aiSuggested: boolean;
  supportBundle: {
    evidenceIds: EntityId[];
    supportAssetIds: EntityId[];
    figureIds: EntityId[];
    methodIds: EntityId[];
    limitationIds: EntityId[];
    citationIds: EntityId[];
    noteIds: EntityId[];
  };
  unresolvedSupportGaps: string[];
  majorConcerns: string[];
  suggestedNextActions: string[];
  validityAssessment?: ClaimValidityAssessment;
  trustReadiness: ClaimTrustReadiness;
};

export type ClaimCheckResult = {
  claimId: EntityId;
  manuscriptId: EntityId;
  validityAssessment: ClaimValidityAssessment;
  summaryForUser: string;
  supportStrength: ClaimValidityDimension;
  overclaimRisk: {
    level: "low" | "moderate" | "high";
    rationale: string;
  };
  missingSupport: string[];
  methodologicalConcern?: string;
  limitationImpact?: string;
  recommendedNextActions: string[];
  majorConcerns: string[];
  evidenceReferencesUsed: Array<{
    objectId: EntityId;
    objectType: "support_asset" | "evidence" | "figure" | "method_block" | "limitation" | "citation";
    label: string;
    supportCategory?: SupportCategory;
    fileType?: string;
    originalFilename?: string;
    linkStatus?: LinkStatus;
  }>;
  stale: boolean;
  freshnessStatus: ClaimValidityFreshnessStatus;
  staleReasons: string[];
};

export type ProjectMemorySummary = {
  projectId: EntityId;
  manuscripts: Array<{ id: EntityId; title: string }>;
  claimAnalyses: ProjectMemoryClaimAnalysis[];
  strongestClaims: Array<{ claimId: EntityId; manuscriptId: EntityId; claimText: string; score: number; scoreBand?: ValidityScoreBand }>;
  weakestClaims: Array<{ claimId: EntityId; manuscriptId: EntityId; claimText: string; score: number; scoreBand?: ValidityScoreBand }>;
  claimsMissingSupport: Array<{ claimId: EntityId; manuscriptId: EntityId; claimText: string; gaps: string[] }>;
  unresolvedContradictions: Array<{ leftClaimId: EntityId; rightClaimId: EntityId; reason: string }>;
  authorConfirmedClaimIds: EntityId[];
  aiSuggestedClaimIds: EntityId[];
  lastDigestedAt: string;
};

export type GroundedDiscussionAnswer = {
  mode:
    | "memory_summary"
    | "claim_explanation"
    | "missing_support"
    | "claim_comparison"
    | "results_paragraph"
    | "conservative_rewrite"
    | "contradiction_tension"
    | "unsupported_question";
  question: string;
  answer: string;
  sourceMode: DiscussionSourceMode;
  fallbackReason?: string;
  focus: {
    scope: "project" | "claim" | "comparison";
    primaryClaimId?: EntityId;
    comparisonClaimId?: EntityId;
  };
  referencedClaimIds: EntityId[];
  usedMemoryObjectIds: EntityId[];
  groundingNotes: string[];
  suggestedFollowUps: string[];
  groundedContext: {
    claims: Array<{
      claimId: EntityId;
      manuscriptId: EntityId;
      manuscriptTitle: string;
      claimText: string;
      claimType: ClaimType;
      strengthLevel: StrengthLevel;
      validityScore?: number;
      validityBand?: ValidityScoreBand;
      trustLifecycleState: ClaimTrustLifecycleState;
      supportCounts: {
        evidence: number;
        figures: number;
        methods: number;
        limitations: number;
        citations: number;
        notes: number;
      };
      majorConcerns: string[];
      unresolvedSupportGaps: string[];
    }>;
    memorySignals: string[];
    contradictions: Array<{
      leftClaimId: EntityId;
      rightClaimId: EntityId;
      reason: string;
    }>;
  };
};

export type ClaimFramingAssessment = {
  assessmentId: EntityId;
  type: "claim_framing_assessment";
  manuscriptId: EntityId;
  claimId: EntityId;
  suggestedClaimType: ClaimType;
  suggestedStrengthLevel: StrengthLevel;
  rationale: string;
  cues: string[];
  modelConfidence: number;
  sourceMode: ClaimFramingSourceMode;
  basedOnSnapshotRef: string;
  basedOnClaimText: string;
  generatedAt: string;
};

export type ClaimDiscussionMessage = {
  id: EntityId;
  type: "claim_discussion_message";
  manuscriptId: EntityId;
  claimId: EntityId;
  threadId: EntityId;
  role: "user" | "assistant";
  content: string;
  sourceMode?: DiscussionSourceMode;
  fallbackReason?: string;
  groundingClaimIds: EntityId[];
  groundingObjectIds: EntityId[];
  createdBy?: EntityId;
  createdAt: string;
};

export type ClaimDiscussionThread = {
  id: EntityId;
  type: "claim_discussion_thread";
  manuscriptId: EntityId;
  claimId: EntityId;
  title?: string;
  createdBy?: EntityId;
  createdAt: string;
  updatedAt: string;
  messages: ClaimDiscussionMessage[];
};
