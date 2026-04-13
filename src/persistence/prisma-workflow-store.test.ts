import { describe, expect, it } from "vitest";
import * as store from "./prisma-workflow-store";

describe("Prisma workflow store contract", () => {
  it("exports Prisma-backed operations for the MVP route workflow", () => {
    expect(typeof store.createProject).toBe("function");
    expect(typeof store.createManuscript).toBe("function");
    expect(typeof store.createAuthor).toBe("function");
    expect(typeof store.createClaim).toBe("function");
    expect(typeof store.updateClaim).toBe("function");
    expect(typeof store.createEvidence).toBe("function");
    expect(typeof store.updateEvidence).toBe("function");
    expect(typeof store.createFigure).toBe("function");
    expect(typeof store.createMethodBlock).toBe("function");
    expect(typeof store.createLimitation).toBe("function");
    expect(typeof store.runReview).toBe("function");
    expect(typeof store.assessClaimValidity).toBe("function");
    expect(typeof store.listLatestClaimValidityAssessments).toBe("function");
    expect(typeof store.getClaimTrustContracts).toBe("function");
    expect(typeof store.getManuscriptTrustContract).toBe("function");
    expect(typeof store.approveClaim).toBe("function");
    expect(typeof store.approveClaimEvidenceLink).toBe("function");
    expect(typeof store.addFinalIntentApproval).toBe("function");
    expect(typeof store.createSection).toBe("function");
    expect(typeof store.updateClaimSectionPlacement).toBe("function");
    expect(typeof store.getStructuredManuscriptView).toBe("function");
  });
});
