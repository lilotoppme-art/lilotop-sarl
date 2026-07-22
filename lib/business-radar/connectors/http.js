const dns = require("dns").promises;
const net = require("net");

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
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
