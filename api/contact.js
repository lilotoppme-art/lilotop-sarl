const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || "contact@lilotopsarl.com";
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || "LILOTOP SARL <onboarding@resend.dev>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const allowedSectors = new Set([
  "Produits chimiques et reactifs miniers",
  "Billes de broyage",
  "Lubrifiants et carburants",
  "Fournitures industrielles",
  "Infrastructures",
  "Conseil strategique",
  "Partenariat",
  "Appel d'offres",
  "Autre",
]);

const allowedDepartments = new Set([
  "Commercial",
  "Achats",
  "Fournisseurs",
  "Appels d'offres",
  "Partenariats",
  "Projets",
  "Finance",
  "Direction",
  "Autre",
]);

function clean(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeSector(value) {
  return clean(value, 120)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function makeReference(prefix = "CNT", now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function parseBody(req) {
  if (typeof req.body === "object" && req.body) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function textMessage(data) {
  return [
    "Nouvelle demande depuis lilotopsarl.com",
    "",
    `Reference: ${data.reference}`,
    `Date et heure: ${data.submittedAt}`,
    `Departement: ${data.department}`,
    `Nom complet: ${data.name}`,
    `Entreprise: ${data.company}`,
    `Email: ${data.email}`,
    `Telephone: ${data.phone}`,
    `Pays: ${data.country}`,
    `Objet: ${data.subject}`,
    `Secteur d'interet: ${data.sector}`,
    "",
    "Message:",
    data.message,
  ].join("\n");
}

function htmlMessage(data) {
  const rows = [
    ["Nom complet", data.name],
    ["Entreprise", data.company],
    ["Email", data.email],
    ["Telephone", data.phone],
    ["Pays", data.country],
    ["Reference", data.reference],
    ["Date et heure", data.submittedAt],
    ["Departement", data.department],
    ["Objet", data.subject],
    ["Secteur d'interet", data.sector],
  ];
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

  return `
    <div style="font-family:Arial,sans-serif;color:#0d1622;line-height:1.55">
      <h2 style="margin:0 0 16px;color:#081728">Nouvelle demande LILOTOP SARL</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px">
        ${rows.map(([label, value]) => `<tr><td style="border:1px solid #d7dde5;font-weight:700;width:190px">${esc(label)}</td><td style="border:1px solid #d7dde5">${esc(value)}</td></tr>`).join("")}
      </table>
      <h3 style="margin:24px 0 8px;color:#081728">Message</h3>
      <p style="white-space:pre-wrap">${esc(data.message)}</p>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  let body = {};
  try {
    body = await parseBody(req);
  } catch {
    return json(res, 400, { ok: false, error: "Invalid JSON body" });
  }

  if (clean(body.website, 120)) {
    return json(res, 200, { ok: true });
  }

  const data = {
    name: clean(body.name, 140),
    company: clean(body.company, 160),
    email: clean(body.email, 180),
    phone: clean(body.phone, 80),
    country: clean(body.country, 120),
    subject: clean(body.subject, 160),
    department: clean(body.department, 120),
    sector: clean(body.sector, 160),
    message: clean(body.message, 5000),
    consent: body.consent === true || body.consent === "on" || body.consent === "true",
    reference: makeReference(),
    submittedAt: new Date().toISOString(),
  };

  const errors = [];
  if (!data.name) errors.push("name");
  if (!data.company) errors.push("company");
  if (!isEmail(data.email)) errors.push("email");
  if (!data.phone) errors.push("phone");
  if (!data.country) errors.push("country");
  if (!allowedDepartments.has(data.department)) errors.push("department");
  if (!data.subject) errors.push("subject");
  if (!allowedSectors.has(normalizeSector(data.sector))) errors.push("sector");
  if (!data.message || data.message.length < 10) errors.push("message");
  if (!data.consent) errors.push("consent");

  if (errors.length) {
    return json(res, 400, { ok: false, error: "Validation failed", fields: errors });
  }

  if (!RESEND_API_KEY) {
    return json(res, 503, {
      ok: false,
      error: "Email service is not configured",
      code: "EMAIL_SERVICE_NOT_CONFIGURED",
      reference: data.reference,
    });
  }

  const subject = `[CNT LILOTOP] ${data.department} - ${data.company} - ${data.subject}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CONTACT_FROM_EMAIL,
      to: [CONTACT_TO_EMAIL],
      reply_to: data.email,
      subject,
      text: textMessage(data),
      html: htmlMessage(data),
    }),
  });

  if (!response.ok) {
    return json(res, 502, { ok: false, error: "Email delivery failed" });
  }

  return json(res, 200, { ok: true, reference: data.reference });
};
