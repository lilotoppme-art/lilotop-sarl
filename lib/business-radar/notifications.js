const { radarConfig } = require("./config");
const { sendWebsiteEmail } = require("../email/sendWebsiteEmail");
const store = require("./store");

function esc(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

function alertReasons(opportunity, now = Date.now()) {
  const reasons = [];
  if (opportunity.score >= 80) reasons.push("score >= 80");
  const remaining = opportunity.deadline_at ? new Date(opportunity.deadline_at).getTime() - now : Infinity;
  if (remaining >= 0 && remaining <= 72 * 60 * 60 * 1000) reasons.push("echeance < 72 heures");
  else if (remaining >= 0 && remaining <= 7 * 24 * 60 * 60 * 1000) reasons.push("echeance < 7 jours");
  if (opportunity.ai_analysis?.supplierRegistrationRequired === true) reasons.push("inscription fournisseur requise");
  return reasons;
}

async function sendOpportunityAlert(opportunity) {
  const { alertEmail } = radarConfig();
  if (!alertEmail || opportunity.is_demo) return { status: "skipped" };
  const reasons = alertReasons(opportunity);
  if (!reasons.length) return { status: "skipped" };
  const prefix = process.env.VERCEL_ENV === "production" ? "Business Radar" : "Business Radar Preview";
  const subject = `[${prefix}] ${opportunity.title}`;
  if (await store.hasNotification(opportunity.id, subject)) return { status: "skipped", reason: "duplicate" };
  try {
    const delivery = await sendWebsiteEmail({
      to: alertEmail, subject,
      text: `${opportunity.title}\n${opportunity.organization || ""}\nScore: ${opportunity.score}/100\nMotifs: ${reasons.join(", ")}\n${opportunity.source_url || ""}`,
      html: `<div style="font-family:Arial,sans-serif;color:#132033"><p style="color:#8a6729;font-weight:700">${esc(prefix)}</p><h2>${esc(opportunity.title)}</h2><p><strong>${esc(opportunity.organization)}</strong></p><p>Score Business Radar: <strong>${opportunity.score}/100</strong></p><p>Motifs: ${esc(reasons.join(", "))}</p><p>${esc(opportunity.ai_summary)}</p>${opportunity.source_url ? `<p><a href="${esc(opportunity.source_url)}">Ouvrir la source</a></p>` : ""}</div>`,
      idempotencyKey: `radar-${process.env.VERCEL_ENV || "local"}-${opportunity.id}`,
    });
    await store.createNotification({ opportunityId: opportunity.id, recipient: alertEmail, subject, status: "sent", providerId: delivery.id });
    return { status: "sent", id: delivery.id };
  } catch (error) {
    await store.createNotification({ opportunityId: opportunity.id, recipient: alertEmail, subject, status: "failed", error: error.code || "EMAIL_FAILED" });
    return { status: "failed", error: error.code || "EMAIL_FAILED" };
  }
}

async function sendRunFailure(runId, errors) {
  const { alertEmail } = radarConfig();
  if (!alertEmail || !errors?.length) return { status: "skipped" };
  const prefix = process.env.VERCEL_ENV === "production" ? "Business Radar" : "Business Radar Preview";
  const subject = `[${prefix}] Echec important du radar`;
  try {
    const delivery = await sendWebsiteEmail({
      to: alertEmail, subject,
      text: `Execution ${runId}\n${errors.map((error) => `${error.source || error.code}: ${error.message}`).join("\n")}`,
      html: `<div style="font-family:Arial,sans-serif;color:#132033"><p style="color:#8a6729;font-weight:700">${esc(prefix)}</p><h2>Echec important du radar</h2><p>Execution: ${esc(runId)}</p><ul>${errors.map((error) => `<li>${esc(error.source || error.code)}: ${esc(error.message)}</li>`).join("")}</ul></div>`,
      idempotencyKey: `radar-run-${runId}`,
    });
    await store.createNotification({ recipient: alertEmail, subject, status: "sent", providerId: delivery.id });
    return { status: "sent" };
  } catch (error) { return { status: "failed", error: error.code || "EMAIL_FAILED" }; }
}

module.exports = { alertReasons, sendOpportunityAlert, sendRunFailure };
