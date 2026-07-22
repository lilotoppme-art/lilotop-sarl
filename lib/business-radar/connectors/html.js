const { safeFetch } = require("./http");

function strip(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }

async function collect(source) {
  const { text, finalUrl } = await safeFetch(source.url);
  const title = strip(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || source.name);
  const description = strip(text.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1] || text).slice(0, 4000);
  return [{ title, organization: source.name, country: source.country, sector: source.config?.sector || "", opportunityType: source.config?.opportunityType || "Source web", description, sourceUrl: finalUrl, publishedAt: new Date().toISOString(), deadlineAt: null, sourceType: "html", isDemo: false }];
}

module.exports = { collect, strip };
