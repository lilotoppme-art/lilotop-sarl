"use strict";

const assert = require("assert");

function request(body, headers = {}) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.50", host: "lilotop-sarl-test-lilotoppme-arts-projects.vercel.app", ...headers },
    socket: {},
    [Symbol.asyncIterator]: async function* iterator() { yield Buffer.from(JSON.stringify(body)); }
  };
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value ? JSON.parse(value) : null; }
  };
}

async function run() {
  process.env.ADMIN_EMAIL = "admin@lilotopsarl.com";
  process.env.ADMIN_PASSWORD_HASH = "pbkdf2:210000:seed:00";
  process.env.AUTH_SECRET = "test-auth-secret-with-more-than-thirty-two-characters";
  process.env.DATABASE_URL = "postgresql://test.invalid/database";
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.vercel.app";

  const storePath = require.resolve("../lib/business-radar/admin-auth-store");
  const emailPath = require.resolve("../lib/email/sendWebsiteEmail");
  let createdReset;
  let sentEmail;
  let consumed = false;
  require.cache[storePath] = { exports: {
    createReset: async (input) => { createdReset = input; return { id: "reset-id", expiresAt: input.expiresAt }; },
    recordEvent: async () => {},
    consumeReset: async (input) => {
      if (consumed || input.tokenHash !== createdReset.tokenHash) return null;
      consumed = true;
      assert.match(input.newPasswordHash, /^pbkdf2:210000:/);
      assert.doesNotMatch(input.newPasswordHash, /ValidPassword/);
      return { email: process.env.ADMIN_EMAIL };
    }
  } };
  require.cache[emailPath] = { exports: {
    sendWebsiteEmail: async (input) => { sentEmail = input; return { ok: true, id: "resend-test-id" }; }
  } };

  const resetModulePath = require.resolve("../lib/business-radar/password-reset");
  delete require.cache[resetModulePath];
  const reset = require(resetModulePath);
  assert.equal(reset.RESET_TTL_MINUTES, 30);
  assert.equal(reset.validNewPassword("short"), false);
  assert.equal(reset.validNewPassword("ValidPassword!2026"), true);
  assert.equal(reset.allowedOrigin({ headers: { host: "unsafe.example.com" } }, "https://safe.vercel.app"), "https://safe.vercel.app");

  const unknownResponse = response();
  await reset.handler(request({ action: "request", email: "unknown@example.com" }), unknownResponse);
  assert.equal(unknownResponse.statusCode, 200);
  assert.equal(createdReset, undefined);
  assert.doesNotMatch(JSON.stringify(unknownResponse.body), /admin@lilotopsarl\.com/);

  const requestResponse = response();
  await reset.handler(request({ action: "request", email: process.env.ADMIN_EMAIL }, { "x-forwarded-for": "198.51.100.51" }), requestResponse);
  assert.equal(requestResponse.statusCode, 200);
  assert.equal(sentEmail.to, process.env.ADMIN_EMAIL);
  assert.match(sentEmail.text, /reset-password\?token=/);
  const rawToken = new URL(sentEmail.text.match(/https:\/\/[^\s]+/)[0]).searchParams.get("token");
  assert.ok(rawToken.length >= 40);
  assert.notEqual(createdReset.tokenHash, rawToken);
  assert.equal(createdReset.tokenHash, reset.sha256(rawToken));
  const ttl = createdReset.expiresAt.getTime() - Date.now();
  assert.ok(ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000);

  const completeResponse = response();
  await reset.handler(request({ action: "complete", token: rawToken, password: "ValidPassword!2026" }, { "x-forwarded-for": "198.51.100.52" }), completeResponse);
  assert.equal(completeResponse.statusCode, 200);
  assert.match(completeResponse.headers["Set-Cookie"], /Max-Age=0/);

  const reusedResponse = response();
  await reset.handler(request({ action: "complete", token: rawToken, password: "ValidPassword!2026" }, { "x-forwarded-for": "198.51.100.53" }), reusedResponse);
  assert.equal(reusedResponse.statusCode, 400);
  assert.match(reusedResponse.body.error, /invalide, expire ou deja utilise/);

  const fs = require("fs");
  const path = require("path");
  const migration = fs.readFileSync(path.join(__dirname, "../db/migrations/018_nexus_admin_password_reset.sql"), "utf8");
  const storeSource = fs.readFileSync(path.join(__dirname, "../lib/business-radar/admin-auth-store.js"), "utf8");
  const resetShell = fs.readFileSync(path.join(__dirname, "../admin/password-reset-shell.html"), "utf8");
  const orchestratorShell = fs.readFileSync(path.join(__dirname, "../admin/orchestrator-shell.html"), "utf8");
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.match(storeSource, /expires_at > now\(\)/);
  assert.match(storeSource, /used_at IS NULL/);
  assert.match(storeSource, /password_reset_completed/);
  assert.match(resetShell, /value="admin@lilotopsarl\.com"/);
  assert.match(resetShell, /id="reset-login-link"/);
  assert.match(orchestratorShell, /Mot de passe oubli&eacute; \?/);
  assert.match(orchestratorShell, /reset-password\?returnTo=%2Fadmin%2Fnexus%2Forchestrator/);
  console.log("admin password reset tests passed");
}

run().catch((error) => { console.error(error); process.exit(1); });
