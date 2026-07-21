const assert = require("assert");
const { Readable } = require("stream");

function clearModule(path) {
  delete require.cache[require.resolve(path)];
}

function responseCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(payload) {
      this.body = payload;
    },
  };
}

async function callJson(path, body, env = {}) {
  Object.assign(process.env, env);
  clearModule(path);
  const handler = require(path);
  const req = { method: "POST", headers: {}, body };
  const res = responseCapture();
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

function multipart(fields, file) {
  const boundary = "----formtest";
  const chunks = [];
  for (const [key, value] of Object.entries(fields)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${item}\r\n`));
    }
  }
  if (file) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="documents"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), boundary };
}

async function callMultipart(path, fields, file, env = {}) {
  Object.assign(process.env, env);
  clearModule(path);
  const handler = require(path);
  const built = multipart(fields, file);
  const req = Readable.from([built.body]);
  req.method = "POST";
  req.headers = { "content-type": `multipart/form-data; boundary=${built.boundary}` };
  const res = responseCapture();
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

function mockResend() {
  process.env.RESEND_API_KEY = "re_test_mock";
  process.env.EMAIL_FROM = "LILOTOP Website <notifications@example.com>";
  process.env.EMAIL_CONTACT_TO = "contact@example.com";
  process.env.EMAIL_RFQ_TO = "commercial@example.com";
  process.env.EMAIL_SUPPLIER_TO = "procurement@example.com";
  process.env.EMAIL_PARTNERSHIP_TO = "partnerships@example.com";
  process.env.EMAIL_TENDER_TO = "tenders@example.com";
  process.env.EMAIL_TEST_MODE = "false";
  global.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ id: `mock-${payload.subject.length}` }) };
  };
}

function resetEmailEnv() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("EMAIL_") || key === "RESEND_API_KEY" || key === "CONTACT_TO_EMAIL" || key === "CONTACT_FROM_EMAIL") {
      delete process.env[key];
    }
  }
  delete global.fetch;
}

const contactValid = {
  name: "Test Production",
  company: "LILOTOP TEST DEPLOYMENT",
  email: "test@example.com",
  phone: "+243800000000",
  country: "RDC",
  department: "Commercial",
  subject: "TEST V1.0 - NE PAS TRAITER",
  sector: "Fournitures industrielles",
  message: "Ceci est un test technique avant mise en production du site LILOTOP SARL.",
  consent: true,
};

const rfqValid = {
  fullName: "Test Production",
  position: "Acheteur",
  company: "LILOTOP TEST DEPLOYMENT",
  email: "test@example.com",
  phone: "+243800000000",
  country: "RDC",
  city: "Kinshasa",
  requestType: "price-request",
  sector: "mining",
  category: "industrial-supplies",
  description: "Ceci est un test technique avant mise en production du site LILOTOP SARL.",
  quantity: "1",
  unit: "lot",
  purchaseFrequency: "one-time",
  deliveryLocation: "Kinshasa",
  desiredDeliveryDate: "2026-08-30",
  currency: "USD",
  consent: "on",
};

const supplierValid = {
  portalType: "supplier",
  company: "LILOTOP TEST DEPLOYMENT",
  country: "RDC",
  city: "Kinshasa",
  contactName: "Test Production",
  position: "Sales",
  email: "test@example.com",
  phone: "+243800000000",
  categories: ["Fournitures industrielles"],
  servedAreas: "RDC",
  capacity: "Capacite documentee pour test technique.",
  leadTime: "15 jours",
  incoterms: "DAP",
  currencies: "USD",
  interest: "distribution",
  consent: "on",
};

(async () => {
  resetEmailEnv();
  let result = await callJson("../api/contact.js", { ...contactValid, email: "bad" });
  assert.equal(result.status, 400);
  assert(result.body.fields.includes("email"));

  result = await callJson("../api/contact.js", {});
  assert.equal(result.status, 400);
  assert(result.body.fields.includes("name"));

  result = await callJson("../api/contact.js", contactValid);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, "EMAIL_SERVICE_NOT_CONFIGURED");
  assert(/^CNT-\d{8}-[A-Z0-9]{4}$/.test(result.body.reference));

  resetEmailEnv();
  result = await callMultipart("../api/rfq.js", rfqValid, { name: "malware.exe", type: "application/octet-stream", buffer: Buffer.from("bad") });
  assert.equal(result.status, 400);
  assert(result.body.files.some((item) => item.includes("file_type")));

  result = await callMultipart("../api/rfq.js", rfqValid, { name: "large.pdf", type: "application/pdf", buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
  assert.equal(result.status, 400);
  assert(result.body.files.some((item) => item.includes("file_size")));

  mockResend();
  result = await callMultipart("../api/rfq.js", rfqValid, { name: "spec.pdf", type: "application/pdf", buffer: Buffer.from("%PDF-test") });
  assert.equal(result.status, 200);
  assert(/^RFQ-\d{8}-[A-Z0-9]{4}$/.test(result.body.reference));
  assert(result.body.deliveryId);

  mockResend();
  result = await callMultipart("../api/portal.js", supplierValid, { name: "catalog.pdf", type: "application/pdf", buffer: Buffer.from("%PDF-test") });
  assert.equal(result.status, 200);
  assert(/^SUP-\d{8}-[A-Z0-9]{4}$/.test(result.body.reference));

  mockResend();
  process.env.VERCEL_ENV = "preview";
  process.env.EMAIL_TEST_MODE = "true";
  process.env.EMAIL_TEST_TO = "preview@example.com";
  result = await callMultipart("../api/portal.js", { ...supplierValid, company: "Preview Test" }, null);
  assert.equal(result.status, 200);
  delete process.env.VERCEL_ENV;

  console.log("forms tests ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
