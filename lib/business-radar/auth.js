const crypto = require("crypto");
const { radarConfig } = require("./config");

const COOKIE_NAME = "lilotop_radar_session";
const SESSION_SECONDS = 8 * 60 * 60;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex"), iterations = 210000) {
  const digest = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${digest}`;
}

function verifyPassword(password, encoded) {
  const [scheme, rounds, salt, expected] = String(encoded || "").split("$");
  if (scheme !== "pbkdf2" || !rounds || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password), salt, Number(rounds), 32, "sha256");
  const target = Buffer.from(expected, "hex");
  return target.length === actual.length && crypto.timingSafeEqual(target, actual);
}

function createSession(email, now = Date.now()) {
  const { authSecret } = radarConfig();
  if (authSecret.length < 32) throw Object.assign(new Error("AUTH_SECRET must contain at least 32 characters"), { code: "AUTH_NOT_CONFIGURED" });
  const payload = base64url(JSON.stringify({ email, exp: Math.floor(now / 1000) + SESSION_SECONDS }));
  return `${payload}.${sign(payload, authSecret)}`;
}

function readCookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function verifySession(req, now = Date.now()) {
  const { authSecret, adminEmail } = radarConfig();
  const token = readCookies(req)[COOKIE_NAME] || "";
  const [payload, signature] = token.split(".");
  if (authSecret.length < 32 || !payload || !signature) return null;
  const expected = sign(payload, authSecret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp <= Math.floor(now / 1000) || data.email !== adminEmail) return null;
    return data;
  } catch {
    return null;
  }
}

function sessionCookie(token) {
  const secure = radarConfig().appUrl.startsWith("https://") ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

function clearSessionCookie() {
  const secure = radarConfig().appUrl.startsWith("https://") ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`;
}

module.exports = { COOKIE_NAME, hashPassword, verifyPassword, createSession, verifySession, sessionCookie, clearSessionCookie };
