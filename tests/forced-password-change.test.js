"use strict";

const assert = require("assert");
const { Readable } = require("stream");
const { hashPassword } = require("../lib/business-radar/auth");

function request(body) {
  const req = Readable.from([]);
  req.method = "POST";
  req.body = body;
  req.headers = { "x-forwarded-for": "198.51.100.80" };
  req.socket = {};
  return req;
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); }
  };
}

async function run() {
  process.env.ADMIN_EMAIL = "admin@lilotopsarl.com";
  process.env.ADMIN_PASSWORD_HASH = hashPassword("EnvironmentFallback!2026");
  process.env.AUTH_SECRET = "test-auth-secret-with-more-than-thirty-two-characters";
  process.env.DATABASE_URL = "postgresql://preview.invalid/database";
  process.env.APP_URL = "https://preview.example.vercel.app";

  const temporaryPassword = "TemporaryAccess!2026";
  const storePath = require.resolve("../lib/business-radar/admin-auth-store");
  const resetPath = require.resolve("../lib/business-radar/password-reset");
  require.cache[storePath] = { exports: {
    activeCredentials: async () => ({
      passwordHash: hashPassword(temporaryPassword),
      mustChangePassword: true
    })
  } };
  require.cache[resetPath] = { exports: {
    createForcedChangeToken: async () => "single-use-forced-change-token"
  } };

  delete require.cache[require.resolve("../api/business-radar-auth")];
  const auth = require("../api/business-radar-auth");
  const res = response();
  await auth(request({ email: process.env.ADMIN_EMAIL, password: temporaryPassword }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.passwordChangeRequired, true);
  assert.equal(res.body.resetToken, "single-use-forced-change-token");
  assert.match(res.headers["Set-Cookie"], /Max-Age=0/);

  const storeSource = require("fs").readFileSync(require.resolve("../lib/business-radar/admin-auth-store"), "utf8");
  assert.match(storeSource, /must_change_password = true/);
  assert.match(storeSource, /must_change_password = false/);
  assert.match(storeSource, /temporary_password_set_at = NULL/);
  console.log("forced password change tests passed");
}

run().catch((error) => { console.error(error); process.exit(1); });
