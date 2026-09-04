"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { opportunityFingerprint } = require("../lib/business-radar/fingerprint");
const { buildPipelineBoard } = require("../lib/nexus/pipeline-priority");
const { deadlineFrom, ingestTenderSearch, tenderOpportunity } = require("../lib/nexus/tender-intake-bridge");
const { runAutomaticPipelineCycle } = require("../lib/nexus/pipeline-runner");

function opportunity(id, values = {}) {
  return {
    id,
    title: `AO ${id}`,
    organization: "Acheteur public",
    country: "RDC",
    sourceUrl: `https://buyer.example/${id}`,
    deadlineAt: "2026-09-20T23:59:59Z",
    score: 75,
    status: "new",
    rawData: { reference: `REF-${id}` },
    createdAt: "2026-09-01T10:00:00Z",
    ...values
  };
}

function workflow(id, opportunityId, values = {}) {
  return {
    id,
    opportunityId,
    title: `Dossier ${opportunityId}`,
    status: "queued",
    currentStep: "analyze",
    dossier: { pipelineStatus: "detected" },
    createdAt: "2026-09-01T11:00:00Z",
    updatedAt: "2026-09-01T11:00:00Z",
    ...values
  };
}

function testPriorityAndCases() {
  const now = new Date("2026-09-04T12:00:00Z");
  const opportunities = [
    opportunity("rdc-open", { title: "Maintenance HVAC Ecobank", score: 82 }),
    opportunity("rdc-partner", { title: "Infrastructure avec JV", score: 88 }),
    opportunity("expired", { deadlineAt: "2026-08-01T12:00:00Z", score: 99 }),
    opportunity("africa", { country: "Kenya", score: 90 }),
    opportunity("rdc-fourth", { score: 70 })
  ];
  const workflows = [
    workflow("w-open", "rdc-open", { dossier: { pipelineStatus: "analyzed", goNoGo: { decision: "A", criticalGaps: [] } } }),
    workflow("w-partner", "rdc-partner", { dossier: { pipelineStatus: "analyzed", goNoGo: { decision: "B", partnerAllowed: true, criticalGaps: ["Partenaire technique"] } } }),
    workflow("w-africa", "africa", { dossier: { pipelineStatus: "analyzed", goNoGo: { decision: "A+", criticalGaps: [] } } }),
    workflow("w-fourth", "rdc-fourth")
  ];
  const board = buildPipelineBoard(opportunities, workflows, now);
  assert.equal(board.top3.length, 3);
  assert.equal(board.top3[0].id, "rdc-open");
  assert.ok(board.top3.some((item) => item.id === "rdc-partner"));
  assert.equal(board.waitingPrioritized.length, 1);
  assert.equal(board.noGo.find((item) => item.id === "expired").decision, "NO-GO");
  assert.ok(board.waitingPartner.some((item) => item.id === "rdc-partner"));
  assert.equal(board.top3.some((item) => item.id === "expired"), false);
}

function testDuplicateFingerprint() {
  const left = opportunityFingerprint({ externalId: "ECD/021/RFP/2026", title: "Ancien titre", organization: "Ecobank" });
  const right = opportunityFingerprint({ reference: "ecd/021/rfp/2026", title: "Titre mis à jour", organization: "Ecobank RDC" });
  assert.equal(left, right);
}

async function testTenderBridge() {
  const mapped = tenderOpportunity({
    title: "ECD/021/RFP/2026 Maintenance HVAC",
    organization: "Ecobank RDC",
    sourceName: "Portail public",
    sourceUrl: "https://buyer.example/notice",
    country: "RDC",
    sector: "Infrastructure",
    deadline: "15 septembre 2026",
    summary: "Maintenance des installations HVAC",
    evidence: "Avis officiel public",
    interestScore: 82,
    classification: "Prioritaire"
  }, { criteria: { sectors: ["Infrastructure"] } });
  assert.equal(mapped.reference, "ECD/021/RFP/2026");
  assert.equal(mapped.deadlineAt, "2026-09-15T23:59:59.999Z");
  assert.equal(deadlineFrom("Date à confirmer"), null);
  const saved = [];
  const result = await ingestTenderSearch({ tenders: [mapped] }, {
    saveOpportunity: async (item) => {
      saved.push(item);
      return { id: "opportunity-1", workflowId: "workflow-1" };
    }
  });
  assert.equal(result.imported, 1);
  assert.deepEqual(result.externalActions, []);
  assert.equal(saved.length, 1);
}

async function testParallelRunner() {
  const opportunities = [1, 2, 3, 4].map((number) => opportunity(`rdc-${number}`, { score: 90 - number }));
  const workflows = opportunities.map((item, index) => workflow(`w-${index + 1}`, item.id));
  const resumed = [];
  const result = await runAutomaticPipelineCycle({
    now: new Date("2026-09-04T12:00:00Z"),
    store: {
      listPipelineOpportunities: async () => opportunities,
      listWorkflows: async () => workflows
    },
    resumeWorkflow: async (id) => { resumed.push(id); return { id }; }
  });
  assert.equal(result.top3.length, 3);
  assert.equal(result.advanced, 3);
  assert.equal(result.waiting, 1);
  assert.equal(resumed.length, 3);
  assert.deepEqual(result.externalActions, []);
}

function testDashboardAndNoAutomaticEmail() {
  const root = path.join(__dirname, "..");
  const shell = fs.readFileSync(path.join(root, "admin", "nexus-shell.html"), "utf8");
  const client = fs.readFileSync(path.join(root, "admin", "nexus.js"), "utf8");
  const radar = fs.readFileSync(path.join(root, "lib", "business-radar", "service.js"), "utf8");
  assert.match(shell, /Pipeline universel AO/);
  assert.match(client, /TOP 3 actifs/);
  assert.match(client, /Action DG aujourd'hui/);
  assert.doesNotMatch(radar, /sendOpportunityAlert|sendRunFailure/);
  assert.match(radar, /runAutomaticPipelineCycle/);
}

async function main() {
  testPriorityAndCases();
  testDuplicateFingerprint();
  await testTenderBridge();
  await testParallelRunner();
  testDashboardAndNoAutomaticEmail();
  console.log("Universal tender pipeline tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
