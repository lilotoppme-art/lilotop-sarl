const { safeFetch } = require("../business-radar/connectors/http");
const store = require("./orchestrator-store");

const UNGM_NOTICE_URL = "https://www.ungm.org/Public/Notice";

function decode(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function field(chunk, pattern) {
  return decode(chunk.match(pattern)?.[1]);
}

function parseUngmNotices(html) {
  return String(html || "")
    .split(/(?=<div\s+role=["']row["'][^>]*class=["'][^"']*notice-table)/i)
    .slice(1)
    .map((chunk) => {
      const noticeId = chunk.match(/data-noticeid=["'](\d+)["']/i)?.[1] || "";
      const title = field(chunk, /class=["'][^"']*ungm-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      const reference = field(chunk, /data-description=["']Reference["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
      const organization = field(chunk, /class=["'][^"']*resultAgency[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
      const opportunityType = field(chunk, /<label[^>]*>([\s\S]*?)<\/label>/i);
      const deadline = field(chunk, /class=["'][^"']*deadline[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
      return {
        noticeId,
        title,
        reference,
        organization,
        opportunityType,
        deadline,
        sourceUrl: noticeId ? `https://www.ungm.org/Public/Notice/${noticeId}` : UNGM_NOTICE_URL
      };
    })
    .filter((notice) => notice.noticeId && notice.title);
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchesMonitor(notice, monitoring) {
  if (!monitoring?.active || String(notice.noticeId) === String(monitoring.parentNotice)) return false;
  const text = normalized([notice.noticeId, notice.reference, notice.title, notice.organization].join(" "));
  const exactKeys = (monitoring.matchKeys || []).slice(0, 2).map(normalized).filter(Boolean);
  if (exactKeys.some((key) => text.includes(key))) return true;
  const africaHall = text.includes("africa hall");
  const electrical = text.includes("electrical") || text.includes("electric");
  const relatedSupply = text.includes("spare part") || text.includes("reinstate") || text.includes("lighting");
  const uneCa = /\b(uneca|eca)\b/.test(text) || text.includes("economic commission for africa");
  return uneCa && africaHall && (electrical || relatedSupply);
}

async function scanMonitoredItbs() {
  const monitors = await store.listActiveItbMonitors();
  if (!monitors.length) return { source: UNGM_NOTICE_URL, monitors: 0, noticesChecked: 0, matches: 0 };
  const { text } = await safeFetch(UNGM_NOTICE_URL);
  const notices = parseUngmNotices(text);
  let matches = 0;
  for (const workflow of monitors) {
    for (const notice of notices) {
      if (!matchesMonitor(notice, workflow.dossier?.itbMonitoring)) continue;
      const recorded = await store.recordItbCandidate(workflow.id, notice, "business-radar@lilotopsarl.com");
      if (recorded) matches += 1;
    }
  }
  return { source: UNGM_NOTICE_URL, monitors: monitors.length, noticesChecked: notices.length, matches };
}

module.exports = { UNGM_NOTICE_URL, matchesMonitor, parseUngmNotices, scanMonitoredItbs };
