const validation = require("./validation");
const store = require("./store");
const { scoreOpportunity } = require("./scoring");
const { opportunityFingerprint } = require("./fingerprint");
const { analyzeOpportunity } = require("./ai");
const { collectFromSource } = require("./connectors");
const { sendOpportunityAlert, sendRunFailure } = require("./notifications");

async function prepare(raw, sourceId = null) {
  const data = validation.opportunity(raw);
  const scoreDetails = scoreOpportunity(data);
  const base = { ...data, sourceId, score: scoreDetails.total, scoreDetails };
  let analysis;
  try { analysis = await analyzeOpportunity(base); } catch (error) { analysis = { mode: "no_ai_fallback", summary: `${data.title} - analyse IA indisponible`, fit: "a_verifier", risks: [error.code || "AI_ANALYSIS_FAILED"], nextActions: ["Reprendre l'analyse manuellement"] }; }
  return { ...base, fingerprint: opportunityFingerprint(data), aiSummary: analysis.summary, aiAnalysis: analysis, analysisMode: analysis.mode, rawData: raw };
}

async function saveOpportunity(raw, sourceId = null) {
  return store.upsertOpportunity(await prepare(raw, sourceId));
}

async function runRadar(triggerType = "manual") {
  const run = await store.createRun(triggerType);
  const stats = { status: "completed", sourcesChecked: 0, itemsFound: 0, itemsCreated: 0, itemsUpdated: 0, errors: [] };
  try {
    const sources = await store.listSources(true);
    for (const source of sources) {
      try {
        const items = await collectFromSource(source);
        stats.sourcesChecked += 1;
        stats.itemsFound += items.length;
        for (const item of items) {
          const saved = await saveOpportunity(item, source.id);
          if (saved.inserted) stats.itemsCreated += 1; else stats.itemsUpdated += 1;
          if (!saved.is_demo) await sendOpportunityAlert(saved);
        }
        await store.touchSource(source.id);
      } catch (error) {
        stats.status = "partial";
        stats.errors.push({ sourceId: source.id, source: source.name, code: error.code || "SOURCE_FAILED", message: String(error.message).slice(0, 240) });
      }
    }
  } catch (error) {
    stats.status = "failed";
    stats.errors.push({ code: error.code || "RUN_FAILED", message: String(error.message).slice(0, 240) });
  }
  const finished = await store.finishRun(run.id, stats);
  if (stats.status === "failed" || stats.errors.length >= 3) await sendRunFailure(run.id, stats.errors);
  return finished;
}

async function analyzeUrl(url) {
  const items = await collectFromSource({ name: new URL(url).hostname, type: "html", url, country: "", config: {} });
  if (!items.length) throw validation.validationError("No analyzable content found");
  return prepare(items[0]);
}

module.exports = { prepare, saveOpportunity, runRadar, analyzeUrl };
