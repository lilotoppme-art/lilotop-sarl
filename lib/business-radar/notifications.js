const { radarConfig } = require("./config");
const { sendWebsiteEmail } = require("../email/sendWebsiteEmail");
const store = require("./store");

function esc(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

async function sendOpportunityAlert(opportunity) {
  const { alertEmail } = radarConfig();
  if (!alertEmail || opportunity.is_demo) return { status: "skipped" };
  const subject = `[Business Radar] Score ${opportunity.score} - ${opportunity.title}`;
  try {
    const delivery = await sendWebsiteEmail({
      to: alertEmail, subject,
      text: `${opportunity.title}\n${opportunity.organization || ""}\nScore: ${opportunity.score}/100\n${opportunity.source_url || ""}`,
      html: `<div style="font-family:Arial,sans-serif;color:#132033"><h2>${esc(opportunity.title)}</h2><p><strong>${esc(opportunity.organization)}</strong></p><p>Score Business Radar: <strong>${opportunity.score}/100</strong></p><p>${esc(opportunity.ai_summary)}</p>${opportunity.source_url ? `<p><a href="${esc(opportunity.source_url)}">Ouvrir la source</a></p>` : ""}</div>`,
      idempotencyKey: `radar-${opportunity.id}-${opportunity.score}`,
    });
    await store.createNotification({ opportunityId: opportunity.id, recipient: alertEmail, subject, status: "sent", providerId: delivery.id });
    return { status: "sent", id: delivery.id };
  } catch (error) {
    await store.createNotification({ opportunityId: opportunity.id, recipient: alertEmail, subject, status: "failed", error: error.code || "EMAIL_FAILED" });
    return { status: "failed", error: error.code || "EMAIL_FAILED" };
  }
}

module.exports = { sendOpportunityAlert };
