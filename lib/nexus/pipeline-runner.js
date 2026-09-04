"use strict";

const store = require("./orchestrator-store");
const { buildPipelineBoard } = require("./pipeline-priority");

const SYSTEM_ACTOR = "pipeline@nexus.local";

async function runAutomaticPipelineCycle(options = {}) {
  const pipelineStore = options.store || store;
  const resume = options.resumeWorkflow || require("./orchestrator-service").resumeWorkflow;
  const [opportunities, workflows] = await Promise.all([
    pipelineStore.listPipelineOpportunities(100),
    pipelineStore.listWorkflows(100)
  ]);
  const board = buildPipelineBoard(opportunities, workflows, options.now || new Date());
  const targets = board.top3.filter((item) => item.workflowId && ["queued", "running"].includes(item.workflowStatus));
  const settled = await Promise.allSettled(targets.map((item) => resume(item.workflowId, options.actorEmail || SYSTEM_ACTOR)));
  return {
    top3: board.top3.map((item) => ({ opportunityId: item.id, workflowId: item.workflowId, priorityScore: item.priorityScore })),
    advanced: settled.filter((item) => item.status === "fulfilled").length,
    failed: settled.filter((item) => item.status === "rejected").length,
    waiting: board.waitingPrioritized.length,
    externalActions: []
  };
}

module.exports = { SYSTEM_ACTOR, runAutomaticPipelineCycle };
