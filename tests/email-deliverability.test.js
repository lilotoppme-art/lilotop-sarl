"use strict";

const assert = require("assert");
const crypto = require("crypto");

const { normalizeResendResult } = require("../lib/email/resend");
const { mapEventStatus } = require("../lib/email/delivery-store");
const { verifySvixSignature } = require("../lib/email/webhook-handler");

assert.equal(normalizeResendResult({ data: { id: "email_123" }, error: null }).data.id, "email_123");
assert.throws(
  () => normalizeResendResult({ data: null, error: { name: "validation_error", message: "Invalid sender", statusCode: 422 } }),
  (error) => error.code === "validation_error" && error.status === 422
);
assert.throws(
  () => normalizeResendResult({ data: null, error: null }),
  (error) => error.code === "RESEND_INVALID_RESPONSE"
);

assert.equal(mapEventStatus("email.delivered"), "delivered");
assert.equal(mapEventStatus("email.delivery_delayed"), "deferred");
assert.equal(mapEventStatus("email.bounced"), "bounced");
assert.equal(mapEventStatus("email.complained"), "complained");
assert.equal(mapEventStatus("email.unknown"), null);

const rawSecret = crypto.randomBytes(32);
const secret = `whsec_${rawSecret.toString("base64")}`;
const id = "msg_test_123";
const timestamp = String(Math.floor(Date.now() / 1000));
const body = JSON.stringify({ type: "email.delivered", data: { email_id: "email_123" } });
const signature = crypto.createHmac("sha256", rawSecret).update(`${id}.${timestamp}.${body}`).digest("base64");

assert.equal(verifySvixSignature({ secret, id, timestamp, signature: `v1,${signature}`, body }), true);
assert.equal(verifySvixSignature({ secret, id, timestamp, signature: "v1,invalid", body }), false);
assert.equal(verifySvixSignature({ secret, id, timestamp: "1", signature: `v1,${signature}`, body }), false);

const sender = require("../lib/email/sendWebsiteEmail");
assert.equal(typeof sender.sendWebsiteEmail, "function");
assert.equal(sender.resolveReplyTo(null, "contact@lilotopsarl.com"), "contact@lilotopsarl.com");
assert.equal(sender.resolveReplyTo("client@example.com", "contact@lilotopsarl.com"), "client@example.com");

console.log("email deliverability tests ok");
