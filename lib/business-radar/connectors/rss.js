const { safeFetch } = require("./http");

function decode(value) {
  return String(value || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return decode(match[1]);
  }
  return "";
}

async function collect(source) {
  const { text } = await safeFetch(source.url);
  const blocks = text.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 50).map((block) => ({
    externalId: tag(block, ["guid", "id"]), title: tag(block, ["title"]), organization: source.name, country: source.country,
    sector: source.config?.sector || "", opportunityType: source.config?.opportunityType || "", description: tag(block, ["description", "summary", "content"]),
    sourceUrl: tag(block, ["link"]) || block.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || source.url,
    publishedAt: tag(block, ["pubDate", "published", "updated"]) || null, deadlineAt: null, sourceType: "rss", isDemo: false,
  })).filter((item) => item.title);
}

module.exports = { collect, decode };
