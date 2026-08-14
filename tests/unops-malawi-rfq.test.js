"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { authorizeSupplierRfq, buildHiltiPilot, buildSupplierCycle, recordSupplierQuotation } = require("../lib/nexus/unops-malawi-rfq");
const { extractTenderTableDocument } = require("../lib/nexus/tender-response-documents");

const schedule = `
ITB/2026/62389 Lot 1: Power Tools
1 Drill machine Each 10
Voltage: 240 V, compliant with IEC 60745
2 Cutting machine Set 4
Blade diameter: 355 mm
ITB/2026/62389 Lot 2: Electrical Installation Components and consumables
1 Distribution board Each 15
IP65 enclosure, IEC 61439
2 Insulation tape Roll 50
Flame retardant PVC
ITB/2026/62389 Lot 10: General Hardware
1 Shredding machine Each 1
DIN compliant steel cutting mechanism
2 Block board Each 5
Exterior grade
ITB/2026/62389 Lot 11: Plumbing
1 Pipe Each 2
`;

const collapsedSchedule = `
ITB/2026/62389 - Section II -Schedule of Requirements - Lot 1: Power Tools
1Drill machine
Portable Drill Machine
Minimum Technical Specifications Required: IEC 60745
Each10
ITB/2026/62389 - Section II -Schedule of Requirements - Lot 2: Electrical Installation Components and consumables
1Distribution board (heavy duty)
Heavy duty Distribution board IP65 IEC 61439
Each15
ITB/2026/62389 - Section II -Schedule of Requirements - Lot 10: General Hardware
1Shredding machine
Cross-cut, 20 litres
Each1
ITB/2026/62389 - Section II -Schedule of Requirements - Lot 11: Plumbing
1Pipe
Each2
`;

const priceSchedule = `
ITB/2026/62389 - Section III -Returnable Bidding Form B - Lot 1: Power Tools
1 | Drill machine | Each | 10 | [object Object]
ITB/2026/62389 - Section III -Returnable Bidding Form B - Lot 2: Electrical Installation Components and consumables
1 | Distribution board (heavy duty) | Each | 15 | [object Object]
ITB/2026/62389 - Section III -Returnable Bidding Form B - Lot 10: General Hardware
1 | Shredding machine | Each | 1 | [object Object]
ITB/2026/62389 - Section III -Returnable Bidding Form B - Lot 11: Plumbing
1 | Pipe | Each | 2 | [object Object]
`;

async function run() {
  const cycle = buildSupplierCycle(schedule, {}, new Date("2026-08-13T12:00:00.000Z"));
  assert.deepEqual(cycle.lots.map((lot) => lot.number), [1, 2, 10]);
  assert.deepEqual(cycle.lots.map((lot) => lot.products.length), [2, 2, 2]);
  assert.equal(cycle.lots[0].products[0].quantity, 10);
  assert.equal(cycle.lots[1].products[0].unit, "Each");
  assert.match(cycle.lots[1].products[0].specifications, /IEC 61439/);
  assert.equal(cycle.rfqs.length, 5);
  assert.equal(cycle.coverageAudit.length, 6);
  assert.equal(cycle.counts.readyForDgReview, 5);
  assert.ok(cycle.coverageAudit.every((item) => item.supplierJustification));
  assert.ok(cycle.coverageAudit.every((item) => [
    "COUVERTURE CONFIRMÉE",
    "COUVERTURE PROBABLE À CONFIRMER",
    "FOURNISSEUR NON ADAPTÉ"
  ].includes(item.verificationStatus)));
  assert.ok(cycle.rfqs.every((rfq) => rfq.status === "EN ATTENTE D'AUTORISATION DG"));
  assert.ok(cycle.rfqs.every((rfq) => rfq.emailSent === false));
  assert.ok(cycle.rfqs.every((rfq) => rfq.emailBody.includes("does not constitute an order")));
  assert.equal(cycle.counts.sent, 0);
  assert.equal(cycle.counts.received, 0);
  assert.equal(cycle.pricing.purchaseCost, null);
  assert.equal(cycle.pricing.landedCost, null);
  assert.deepEqual(cycle.pricing.marginScenarios, []);
  assert.equal(cycle.pricing.financialOfferStatus, "EN ATTENTE DE COTATIONS FOURNISSEURS");
  assert.equal(cycle.pilot.supplier, "Hilti");
  assert.equal(cycle.pilot.dryRun.realSendPerformed, false);
  assert.equal(cycle.pilot.authorization.doubleConfirmationRequired, true);
  assert.equal(cycle.pilot.contact.email, "customercare.za@hilti.com");
  assert.equal(cycle.pilot.responseTracking.operational, false);
  assert.equal(cycle.pilot.responseTracking.authorizationStatus, "NON CONFIGURE");
  assert.match(cycle.pilot.subject, /NEXUS-RFQ-ITB2026-62389-HILTI-L1/);
  assert.match(cycle.pilot.emailBody, /product datasheets and product photos/);
  assert.match(cycle.pilot.emailBody, /DAP Lilongwe/);
  assert.match(cycle.pilot.emailBody, /FCA price and named FCA location/);
  assert.match(cycle.pilot.emailBody, /DPU Lilongwe/);
  assert.deepEqual(cycle.pilot.attachments.map((item) => item.name), ["RFQ_LILOTOP_HILTI_ITB-2026-62389_Lot1.pdf"]);

  const configuredPilot = buildHiltiPilot(cycle.rfqs, {
    RESEND_API_KEY: "hidden",
    RFQ_FROM: "LILOTOP SARL <contact@lilotopsarl.com>",
    RFQ_REPLY_TO: "contact@lilotopsarl.com",
    GOOGLE_OAUTH_CLIENT_ID: "hidden",
    GOOGLE_OAUTH_CLIENT_SECRET: "hidden",
    GOOGLE_OAUTH_REDIRECT_URI: "https://preview.example.vercel.app/api/nexus-gmail/callback",
    GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY: "x".repeat(32),
    GMAIL_INBOUND_MAILBOX: "contact@lilotopsarl.com"
  });
  assert.equal(configuredPilot.dryRun.senderConfigured, true);
  assert.equal(configuredPilot.responseTracking.operational, false);
  assert.equal(configuredPilot.responseTracking.oauthConfigured, true);
  assert.equal(configuredPilot.responseTracking.authorizationStatus, "AUTORISATION GOOGLE REQUISE PAR LE DG");
  assert.doesNotMatch(configuredPilot.dryRun.sender, /notifications@/);

  const collapsedCycle = buildSupplierCycle(
    collapsedSchedule,
    {},
    new Date("2026-08-13T12:00:00.000Z"),
    priceSchedule
  );
  assert.deepEqual(collapsedCycle.lots.map((lot) => lot.products.length), [1, 1, 1]);
  assert.equal(collapsedCycle.lots[0].products[0].product, "Drill machine");
  assert.equal(collapsedCycle.lots[1].products[0].quantity, 15);
  assert.match(collapsedCycle.lots[1].products[0].specifications, /IP65 IEC 61439/);

  const partialPriceCycle = buildSupplierCycle(
    schedule,
    {},
    new Date("2026-08-13T12:00:00.000Z"),
    priceSchedule
  );
  assert.deepEqual(partialPriceCycle.lots.map((lot) => lot.products.length), [2, 2, 2]);
  assert.equal(partialPriceCycle.counts.products, 6);

  const officialSchedulePath = path.join(__dirname, "..", "tmp", "itb-2026-62389", "Section-II-Schedule.pdf");
  if (fs.existsSync(officialSchedulePath)) {
    const official = await extractTenderTableDocument({
      filename: "Section-II-Schedule.pdf",
      buffer: fs.readFileSync(officialSchedulePath)
    });
    const officialCycle = buildSupplierCycle(official.text, {}, new Date("2026-08-13T12:00:00.000Z"));
    assert.deepEqual(officialCycle.lots.map((lot) => lot.products.length), [20, 54, 9]);
    assert.equal(officialCycle.counts.products, 83);
    assert.equal(officialCycle.counts.prepared, 17);
    assert.equal(officialCycle.counts.readyForDgReview, 17);
    assert.equal(officialCycle.counts.sent, 0);
    assert.equal(officialCycle.counts.received, 0);
    assert.equal(officialCycle.pilot.lineCount, 6);
    assert.deepEqual(officialCycle.pilot.lines.map((item) => item.itemNumber), [1, 12, 13, 14, 15, 16]);
    assert.ok(officialCycle.pilot.lines.every((item) => item.extractionCompliance === "CONFORME AU DAO OFFICIEL"));
    assert.ok(officialCycle.pilot.lines.every((item) => item.datasheetRequired));
    assert.equal(officialCycle.coverageAudit.length, 83);
    assert.ok(officialCycle.coverageAudit.every((item) => item.verificationStatus !== "FOURNISSEUR NON ADAPTÃ‰"));
    assert.ok(officialCycle.rfqs.every((rfq) => rfq.coverageCounts.rejected === 0));
    assert.ok(officialCycle.rfqs.every((rfq) => rfq.emailBody.includes("COMPLY: YES / NO / ALTERNATIVE")));
    assert.ok(officialCycle.rfqs.every((rfq) => rfq.emailBody.includes("MANUFACTURER / MODEL / PART NUMBER")));
    assert.ok(officialCycle.rfqs.every((rfq) => rfq.responseDeadlineLabel.includes("Malawi time")));
    assert.equal(officialCycle.rfqs.find((rfq) => rfq.supplier === "Marley / Aliaxis").contact.verified, true);
    assert.equal(officialCycle.rfqs.find((rfq) => rfq.supplier === "RS South Africa").products.length, 3);
    assert.equal(officialCycle.rfqs.find((rfq) => rfq.supplier === "Makita South Africa").contact.email, "info@rutherford.co.za");
    assert.equal(officialCycle.rfqs.find((rfq) => rfq.supplier === "Schneider Electric").contact.email, "za-ccc@se.com");
    assert.equal(officialCycle.rfqs.find((rfq) => rfq.supplier === "Makita South Africa").priority, "A");
    assert.equal(officialCycle.rfqs.find((rfq) => rfq.supplier === "Werner Ladders").priority, "C");
    assert.equal(officialCycle.rfqs.find((rfq) => rfq.supplier === "Ingersoll Rand / Rhino Lifting").sendRecommendation, "NON");
    assert.equal(officialCycle.counts.priorityA, 9);
    assert.equal(officialCycle.counts.priorityB, 6);
    assert.equal(officialCycle.counts.priorityC, 1);
    assert.equal(officialCycle.counts.recommended, 13);
    assert.ok(officialCycle.rfqs.filter((rfq) => rfq.sendRecommendation === "OUI").every((rfq) => rfq.rfqPdfReady));
  }

  assert.throws(() => recordSupplierQuotation(cycle, {
    rfqId: cycle.rfqs[0].id,
    currency: "USD",
    totalPrice: 1000
  }), /message ou document source/);

  const withQuotation = recordSupplierQuotation(cycle, {
    rfqId: cycle.rfqs[0].id,
    evidenceDocumentId: "quote-document-1",
    currency: "USD",
    totalPrice: 1000,
    transport: 100,
    insurance: 20,
    dutiesAndTaxes: 50,
    localLogistics: 30,
    otherDocumentedCosts: 0,
    incoterm: "FCA",
    deliveryLeadTime: "30 days",
    warranty: "12 months",
    paymentTerms: "30 days",
    validity: "30 days"
  }, new Date("2026-08-13T13:00:00.000Z"));
  assert.equal(withQuotation.counts.received, 1);
  assert.equal(withQuotation.counts.missing, cycle.rfqs.length - 1);
  assert.equal(withQuotation.comparison[0].landedCost, 1200);
  assert.equal(withQuotation.rfqs[0].status, "COTATION RECUE");
  assert.deepEqual(withQuotation.pricing.marginScenarios, []);

  const authorizedTargetIndex = cycle.rfqs.findIndex((rfq) => rfq.sendRecommendation === "OUI");
  assert.ok(authorizedTargetIndex >= 0);
  const authorizedTarget = cycle.rfqs[authorizedTargetIndex];
  const authorized = authorizeSupplierRfq(cycle, authorizedTarget.id, "admin@lilotopsarl.com");
  assert.equal(authorized.rfqs[authorizedTargetIndex].status, "AUTORISEE PAR LE DG - ENVOI NON DECLENCHE");
  assert.equal(authorized.rfqs[authorizedTargetIndex].emailSent, false);
  assert.equal(authorized.rfqs[authorizedTargetIndex].sentAt, null);
  assert.equal(authorized.counts.sent, 0);

  assert.throws(() => authorizeSupplierRfq({
    ...cycle,
    rfqs: cycle.rfqs.map((rfq, index) => index === authorizedTargetIndex ? { ...rfq, sentAt: "2026-08-14T21:25:22.000Z", emailSent: true } : rfq)
  }, authorizedTarget.id, "admin@lilotopsarl.com"), /deja ete envoyee/);

  assert.throws(() => authorizeSupplierRfq({
    ...cycle,
    rfqs: cycle.rfqs.map((rfq, index) => index === authorizedTargetIndex ? { ...rfq, sendRecommendation: "NON", directEmailVerified: false } : rfq)
  }, authorizedTarget.id, "admin@lilotopsarl.com"), /coordonnees et la couverture/);

  console.log("UNOPS Malawi RFQ supplier-cycle tests passed.");
}

run().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
