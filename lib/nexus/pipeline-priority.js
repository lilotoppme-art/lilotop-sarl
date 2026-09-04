"use strict";

const TERMINAL_PIPELINE_STATUSES = new Set([
  "submitted", "eoi-submitted-waiting-itb", "won", "lost", "rejected", "abandoned", "expired"
]);

const STEP_PROGRESS = Object.freeze({
  analyze: 15,
  "source-suppliers": 45,
  "prepare-rfqs": 65,
  finalize: 85,
  completed: 100
});

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function geography(country) {
  const value = normalized(country);
  if (/\b(rdc|republique democratique du congo|democratic republic of (?:the )?congo|dr congo|drc|congo kinshasa)\b/.test(value)) {
    return { tier: 0, label: "RDC", points: 30 };
  }
  if (/congo|angola|zambie|zambia|cameroun|cameroon|gabon|tchad|chad|centrafrique|central african|burundi|rwanda/.test(value)) {
    return { tier: 1, label: "Afrique centrale / corridor régional", points: 18 };
  }
  if (/afrique|africa|malawi|mozambique|namibie|namibia|botswana|zimbabwe|tanzanie|tanzania|kenya|ouganda|uganda|south africa/.test(value)) {
    return { tier: 2, label: "Afrique", points: 8 };
  }
  return { tier: 3, label: "Autre", points: 0 };
}

function deadlineState(value, now = new Date()) {
  if (!value) return { official: null, internal: null, remainingHours: null, expired: false, urgent: false };
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return { official: null, internal: null, remainingHours: null, expired: false, urgent: false };
  const remainingHours = Math.floor((deadline.getTime() - new Date(now).getTime()) / 3600000);
  return {
    official: deadline.toISOString(),
    internal: new Date(deadline.getTime() - 24 * 3600000).toISOString(),
    remainingHours,
    expired: remainingHours < 0,
    urgent: remainingHours >= 0 && remainingHours < 72
  };
}

function workflowFor(opportunity, workflows) {
  return workflows
    .filter((item) => item.opportunityId === opportunity.id)
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))[0] || null;
}

function inferredDecision(opportunity, workflow, deadline) {
  if (deadline.expired || opportunity.status === "archived") return "NO-GO";
  if (workflow?.dossier?.goNoGo?.decision) return workflow.dossier.goNoGo.decision;
  const score = Number(opportunity.score) || 0;
  if (score >= 85) return "A+";
  if (score >= 70) return "A";
  return "B";
}

function progressFor(workflow) {
  if (!workflow) return 0;
  if (workflow.status === "completed") return 100;
  return STEP_PROGRESS[workflow.currentStep] || 10;
}

function blockersFor(opportunity, workflow, deadline, decision) {
  if (deadline.expired) return ["Échéance expirée"];
  const blockers = [];
  if (workflow?.lastError) blockers.push(workflow.lastError);
  blockers.push(...(workflow?.dossier?.goNoGo?.criticalGaps || []));
  if (!opportunity.sourceUrl) blockers.push("Source officielle à confirmer");
  if (workflow?.dossier?.tenderSource?.retrievalStatus === "unavailable") blockers.push("Document source à obtenir");
  if (decision === "B" && workflow?.dossier?.goNoGo?.partnerAllowed) blockers.push("Partenaire/JV à qualifier");
  return [...new Set(blockers)].slice(0, 5);
}

function priorityScore(opportunity, workflow, deadline, geo, decision) {
  const base = Number(workflow?.dossier?.analysis?.opportunityScore ?? opportunity.score) || 0;
  const decisionPoints = { "A+": 20, A: 12, B: 2, "NO-GO": -100 }[decision] || 0;
  const urgency = deadline.remainingHours === null ? 0
    : deadline.remainingHours < 0 ? -100
      : deadline.remainingHours < 72 ? 18
        : deadline.remainingHours < 168 ? 12
          : deadline.remainingHours < 336 ? 6 : 0;
  const gaps = (workflow?.dossier?.goNoGo?.criticalGaps || []).length * 5;
  return Math.max(0, Math.min(100, Math.round(base * 0.55 + geo.points + decisionPoints + urgency - gaps)));
}

function actionFor(item) {
  if (item.deadline.expired) return "Aucune — dossier expiré";
  if (item.workflowStatus === "paused") return `Corriger : ${item.blockers[0] || "workflow en pause"}`;
  if (item.blockers.length) return `Valider : ${item.blockers[0]}`;
  if (!item.workflowId) return "Créer le dossier NEXUS";
  if (item.currentStep === "completed") return "Validation DG finale";
  return "Laisser NEXUS poursuivre la préparation";
}

function rankItems(left, right) {
  const exceptionalLeft = left.geography.tier > 0 && left.priorityScore >= 95;
  const exceptionalRight = right.geography.tier > 0 && right.priorityScore >= 95;
  if (left.geography.tier !== right.geography.tier && !exceptionalLeft && !exceptionalRight) {
    return left.geography.tier - right.geography.tier;
  }
  return right.priorityScore - left.priorityScore
    || (left.deadline.remainingHours ?? Number.MAX_SAFE_INTEGER) - (right.deadline.remainingHours ?? Number.MAX_SAFE_INTEGER);
}

function buildPipelineBoard(opportunities = [], workflows = [], now = new Date()) {
  const items = opportunities.filter((item) => !item.is_demo && !item.isDemo).map((opportunity) => {
    const workflow = workflowFor(opportunity, workflows);
    const intake = workflow?.dossier?.intake || opportunity.rawData?.intake || opportunity.raw_data?.intake || {};
    const deadline = deadlineState(intake.officialDeadline || opportunity.deadlineAt || opportunity.deadline_at, now);
    const geo = geography(opportunity.country);
    const decision = inferredDecision(opportunity, workflow, deadline);
    const pipelineStatus = workflow?.dossier?.pipelineStatus || (deadline.expired ? "expired" : "detected");
    const terminal = deadline.expired || TERMINAL_PIPELINE_STATUSES.has(pipelineStatus);
    const blockers = blockersFor(opportunity, workflow, deadline, decision);
    const item = {
      id: opportunity.id,
      workflowId: workflow?.id || null,
      workflowStatus: workflow?.status || null,
      currentStep: workflow?.currentStep || null,
      title: opportunity.title,
      buyer: opportunity.organization || null,
      country: opportunity.country || null,
      reference: opportunity.externalId || opportunity.external_id || opportunity.rawData?.reference || opportunity.raw_data?.reference || null,
      detectedAt: opportunity.createdAt || opportunity.created_at || null,
      decision,
      geography: geo,
      deadline,
      pipelineStatus,
      progress: progressFor(workflow),
      blockers,
      terminal,
      priorityScore: 0,
      actionDg: ""
    };
    item.priorityScore = priorityScore(opportunity, workflow, deadline, geo, decision);
    item.actionDg = actionFor(item);
    return item;
  });

  const eligible = items.filter((item) => !item.terminal && item.decision !== "NO-GO").sort(rankItems);
  const running = eligible.filter((item) => item.workflowStatus === "running");
  const top3 = [...running, ...eligible.filter((item) => !running.includes(item))].slice(0, 3);
  const topIds = new Set(top3.map((item) => item.id));
  const waitingPrioritized = eligible.filter((item) => !topIds.has(item.id));
  const noGo = items.filter((item) => item.decision === "NO-GO" || item.terminal && item.pipelineStatus !== "submitted" && item.pipelineStatus !== "eoi-submitted-waiting-itb");
  const submitted = items.filter((item) => ["submitted", "eoi-submitted-waiting-itb"].includes(item.pipelineStatus));
  const readyToSubmit = items.filter((item) => ["ready-to-send", "validation-required"].includes(item.pipelineStatus));
  return {
    generatedAt: new Date(now).toISOString(),
    newRdc: items.filter((item) => item.geography.tier === 0 && item.pipelineStatus === "detected" && !item.terminal),
    top3,
    waitingPrioritized,
    readyToSubmit,
    actionToday: eligible.filter((item) => item.blockers.length || item.deadline.urgent).slice(0, 8),
    waitingSupplier: items.filter((item) => ["source-suppliers", "suppliers-researched", "rfqs-prepared"].includes(item.currentStep || item.pipelineStatus)),
    waitingPartner: items.filter((item) => item.decision === "B" && item.blockers.some((value) => /partenaire|JV/i.test(value))),
    noGo,
    submitted,
    urgent72h: items.filter((item) => item.deadline.urgent && !item.terminal)
  };
}

module.exports = { TERMINAL_PIPELINE_STATUSES, buildPipelineBoard, deadlineState, geography, rankItems };
