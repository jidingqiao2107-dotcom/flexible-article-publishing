import { isPreviewMode } from "@/server/runtime-mode";
import * as demoStore from "./demo-store";

async function realStore() {
  return import("./prisma-workflow-store");
}

async function missingRealModeFeature(functionName: string): Promise<never> {
  throw new Error(`${functionName} is currently available in founder preview mode only.`);
}

export async function listProjects() {
  return isPreviewMode() ? demoStore.listProjects() : (await realStore()).listProjects();
}

export async function createProject(input: Parameters<typeof demoStore.createProject>[0]) {
  return isPreviewMode() ? demoStore.createProject(input) : (await realStore()).createProject(input);
}

export async function listManuscripts(projectId?: string) {
  return isPreviewMode() ? demoStore.listManuscripts(projectId) : (await realStore()).listManuscripts(projectId);
}

export async function createManuscript(input: Parameters<typeof demoStore.createManuscript>[0]) {
  return isPreviewMode() ? demoStore.createManuscript(input) : (await realStore()).createManuscript(input);
}

export async function getResearchObjectGraph(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.getResearchObjectGraph(manuscriptId) : (await realStore()).getResearchObjectGraph(manuscriptId);
}

export async function listAuthors(projectId?: string) {
  return isPreviewMode() ? demoStore.listAuthors(projectId) : (await realStore()).listAuthors(projectId);
}

export async function createAuthor(input: Parameters<typeof demoStore.createAuthor>[0]) {
  return isPreviewMode() ? demoStore.createAuthor(input) : (await realStore()).createAuthor(input);
}

export async function getActorMembershipContext(actorId: string, manuscriptId?: string) {
  return isPreviewMode()
    ? demoStore.getActorMembershipContext(actorId, manuscriptId)
    : (await realStore()).getActorMembershipContext(actorId, manuscriptId);
}

export async function listClaims(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.listClaims(manuscriptId) : (await realStore()).listClaims(manuscriptId);
}

export async function createClaim(input: Parameters<typeof demoStore.createClaim>[0]) {
  return isPreviewMode() ? demoStore.createClaim(input) : (await realStore()).createClaim(input);
}

export async function updateClaim(input: Parameters<typeof demoStore.updateClaim>[0]) {
  return isPreviewMode() ? demoStore.updateClaim(input) : (await realStore()).updateClaim(input);
}

export async function listEvidence(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.listEvidence(manuscriptId) : (await realStore()).listEvidence(manuscriptId);
}

export async function listSupportAssets(manuscriptId?: string) {
  if (isPreviewMode()) {
    return demoStore.listSupportAssets(manuscriptId);
  }

  const store = (await realStore()) as Record<string, unknown>;
  const fn = store.listSupportAssets as ((manuscriptId?: string) => Promise<unknown>) | undefined;
  return fn ? fn(manuscriptId) : missingRealModeFeature("Support asset listing");
}

export async function createSupportAsset(input: Parameters<typeof demoStore.createSupportAsset>[0]) {
  if (isPreviewMode()) {
    return demoStore.createSupportAsset(input);
  }

  const store = (await realStore()) as Record<string, unknown>;
  const fn = store.createSupportAsset as ((payload: typeof input) => Promise<unknown>) | undefined;
  return fn ? fn(input) : missingRealModeFeature("Support asset uploads");
}

export async function createEvidence(input: Parameters<typeof demoStore.createEvidence>[0]) {
  return isPreviewMode() ? demoStore.createEvidence(input) : (await realStore()).createEvidence(input);
}

export async function updateEvidence(input: Parameters<typeof demoStore.updateEvidence>[0]) {
  return isPreviewMode() ? demoStore.updateEvidence(input) : (await realStore()).updateEvidence(input);
}

export async function listFigures(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.listFigures(manuscriptId) : (await realStore()).listFigures(manuscriptId);
}

export async function createFigure(input: Parameters<typeof demoStore.createFigure>[0]) {
  return isPreviewMode() ? demoStore.createFigure(input) : (await realStore()).createFigure(input);
}

export async function updateSupportAssetClaimMapping(input: Parameters<typeof demoStore.updateSupportAssetClaimMapping>[0]) {
  if (isPreviewMode()) {
    return demoStore.updateSupportAssetClaimMapping(input);
  }

  const store = (await realStore()) as Record<string, unknown>;
  const fn = store.updateSupportAssetClaimMapping as ((payload: typeof input) => Promise<unknown>) | undefined;
  return fn ? fn(input) : missingRealModeFeature("Support asset claim mapping");
}

export async function listMethods(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.listMethods(manuscriptId) : (await realStore()).listMethods(manuscriptId);
}

export async function createMethodBlock(input: Parameters<typeof demoStore.createMethodBlock>[0]) {
  return isPreviewMode() ? demoStore.createMethodBlock(input) : (await realStore()).createMethodBlock(input);
}

export async function listLimitations(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.listLimitations(manuscriptId) : (await realStore()).listLimitations(manuscriptId);
}

export async function createLimitation(input: Parameters<typeof demoStore.createLimitation>[0]) {
  return isPreviewMode() ? demoStore.createLimitation(input) : (await realStore()).createLimitation(input);
}

export async function listCitations(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.listCitations(manuscriptId) : (await realStore()).listCitations(manuscriptId);
}

export async function createCitation(input: Parameters<typeof demoStore.createCitation>[0]) {
  return isPreviewMode() ? demoStore.createCitation(input) : (await realStore()).createCitation(input);
}

export async function createSection(input: Parameters<typeof demoStore.createSection>[0]) {
  return isPreviewMode() ? demoStore.createSection(input) : (await realStore()).createSection(input);
}

export async function updateClaimSectionPlacement(input: Parameters<typeof demoStore.updateClaimSectionPlacement>[0]) {
  return isPreviewMode()
    ? demoStore.updateClaimSectionPlacement(input)
    : (await realStore()).updateClaimSectionPlacement(input);
}

export async function runReview(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.runReview(manuscriptId) : (await realStore()).runReview(manuscriptId);
}

export async function listLatestClaimValidityAssessments(input?: Parameters<typeof demoStore.listLatestClaimValidityAssessments>[0]) {
  return isPreviewMode()
    ? demoStore.listLatestClaimValidityAssessments(input)
    : (await realStore()).listLatestClaimValidityAssessments(input);
}

export async function assessClaimValidity(input: Parameters<typeof demoStore.assessClaimValidity>[0]) {
  return isPreviewMode() ? demoStore.assessClaimValidity(input) : (await realStore()).assessClaimValidity(input);
}

export async function getClaimCheckResult(input: Parameters<typeof demoStore.getClaimCheckResult>[0]) {
  if (isPreviewMode()) {
    return demoStore.getClaimCheckResult(input);
  }

  const store = (await realStore()) as Record<string, unknown>;
  const fn = store.getClaimCheckResult as ((payload: typeof input) => Promise<unknown>) | undefined;
  return fn ? fn(input) : missingRealModeFeature("Claim check lookup");
}

export async function runClaimCheck(input: Parameters<typeof demoStore.runClaimCheck>[0]) {
  if (isPreviewMode()) {
    return demoStore.runClaimCheck(input);
  }

  const store = (await realStore()) as Record<string, unknown>;
  const fn = store.runClaimCheck as ((payload: typeof input) => Promise<unknown>) | undefined;
  return fn ? fn(input) : missingRealModeFeature("Claim check execution");
}

export async function getClaimTrustContracts(manuscriptId?: string) {
  return isPreviewMode() ? demoStore.getClaimTrustContracts(manuscriptId) : (await realStore()).getClaimTrustContracts(manuscriptId);
}

export async function getManuscriptTrustContract(manuscriptId?: string) {
  return isPreviewMode()
    ? demoStore.getManuscriptTrustContract(manuscriptId)
    : (await realStore()).getManuscriptTrustContract(manuscriptId);
}

export async function digestProjectMemory(projectId?: string) {
  return isPreviewMode() ? demoStore.digestProjectMemory(projectId) : (await realStore()).digestProjectMemory(projectId);
}

export async function getProjectMemory(projectId?: string) {
  return isPreviewMode() ? demoStore.getProjectMemory(projectId) : (await realStore()).getProjectMemory(projectId);
}

export async function answerProjectDiscussion(input: Parameters<typeof demoStore.answerProjectDiscussion>[0]) {
  return isPreviewMode() ? demoStore.answerProjectDiscussion(input) : (await realStore()).answerProjectDiscussion(input);
}

export async function getClaimDiscussionThread(claimId: string) {
  return isPreviewMode() ? demoStore.getClaimDiscussionThread(claimId) : (await realStore()).getClaimDiscussionThread(claimId);
}

export async function askClaimDiscussion(input: Parameters<typeof demoStore.askClaimDiscussion>[0]) {
  return isPreviewMode() ? demoStore.askClaimDiscussion(input) : (await realStore()).askClaimDiscussion(input);
}

export async function approveClaim(
  claimId: string,
  actorId: string,
  options?: Parameters<typeof demoStore.approveClaim>[2]
) {
  return isPreviewMode() ? demoStore.approveClaim(claimId, actorId, options) : (await realStore()).approveClaim(claimId, actorId, options);
}

export async function approveClaimEvidenceLink(input: Parameters<typeof demoStore.approveClaimEvidenceLink>[0]) {
  return isPreviewMode() ? demoStore.approveClaimEvidenceLink(input) : (await realStore()).approveClaimEvidenceLink(input);
}

export async function approveClaimMethodLink(input: Parameters<typeof demoStore.approveClaimMethodLink>[0]) {
  return isPreviewMode() ? demoStore.approveClaimMethodLink(input) : (await realStore()).approveClaimMethodLink(input);
}

export async function approveClaimLimitationLink(input: Parameters<typeof demoStore.approveClaimLimitationLink>[0]) {
  return isPreviewMode()
    ? demoStore.approveClaimLimitationLink(input)
    : (await realStore()).approveClaimLimitationLink(input);
}

export async function markClaimPublicationReady(claimId: string, actorId: string) {
  return isPreviewMode()
    ? demoStore.markClaimPublicationReady(claimId, actorId)
    : (await realStore()).markClaimPublicationReady(claimId, actorId);
}

export async function addFinalIntentApproval(input: Parameters<typeof demoStore.addFinalIntentApproval>[0]) {
  return isPreviewMode() ? demoStore.addFinalIntentApproval(input) : (await realStore()).addFinalIntentApproval(input);
}

export async function createExport(input?: Parameters<typeof demoStore.createExport>[0]) {
  return isPreviewMode() ? demoStore.createExport(input) : (await realStore()).createExport(input);
}

export async function getStructuredManuscriptView(manuscriptId?: string) {
  return isPreviewMode()
    ? demoStore.getStructuredManuscriptView(manuscriptId)
    : (await realStore()).getStructuredManuscriptView(manuscriptId);
}

export async function resetDevelopmentQaData() {
  return isPreviewMode() ? demoStore.resetDevelopmentQaData() : (await realStore()).resetDevelopmentQaData();
}

export async function seedDevelopmentQaScenario() {
  return isPreviewMode() ? demoStore.seedDevelopmentQaScenario() : (await realStore()).seedDevelopmentQaScenario();
}
