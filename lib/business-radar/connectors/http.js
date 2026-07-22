const dns = require("dns").promises;
const net = require("net");

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0);
  }
  const value = String(address || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (value.startsWith("::ffff:")) return privateAddress(value.slice(7));
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    value.startsWith("fe80:") || value.startsWith("ff") || value.startsWith("2001:db8:");
}

async function assertPublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new Error("Invalid source URL"), { code: "UNSAFE_URL" }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Object.assign(new Error("Only public HTTP(S) URLs are allowed"), { code: "UNSAFE_URL" });
  const records = await dns.lookup(url.hostname, { all: true });
  if (!records.length || records.some((record) => privateAddress(record.address))) throw Object.assign(new Error("Private or local URLs are not allowed"), { code: "UNSAFE_URL" });
  return url;
}

async function safeFetch(value) {
  const url = await assertPublicUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "error", headers: { "User-Agent": "LILOTOP-Business-Radar/1.0" } });
    if (!response.ok) throw Object.assign(new Error(`Source returned ${response.status}`), { code: "FETCH_FAILED" });
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 2 * 1024 * 1024) throw Object.assign(new Error("Source is too large"), { code: "FETCH_FAILED" });
    const text = await response.text();
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw Object.assign(new Error("Source is too large"), { code: "FETCH_FAILED" });
    return { text, contentType: response.headers.get("content-type") || "", finalUrl: url.toString() };
  } finally { clearTimeout(timeout); }
}

module.exports = { assertPublicUrl, safeFetch, privateAddress };
