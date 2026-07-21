function clean(value) {
  return String(value || "").trim();
}

function bool(value) {
  return String(value || "").toLowerCase() === "true";
}

function siteUrl() {
  return (clean(process.env.NEXT_PUBLIC_SITE_URL) || "https://lilotopsarl.com").replace(/\/+$/, "");
}

function emailConfig() {
  return {
    apiKey: clean(process.env.RESEND_API_KEY),
    from: clean(process.env.EMAIL_FROM),
    replyTo: clean(process.env.EMAIL_REPLY_TO),
    contactTo: clean(process.env.EMAIL_CONTACT_TO),
    rfqTo: clean(process.env.EMAIL_RFQ_TO),
    supplierTo: clean(process.env.EMAIL_SUPPLIER_TO),
    partnershipTo: clean(process.env.EMAIL_PARTNERSHIP_TO),
    tenderTo: clean(process.env.EMAIL_TENDER_TO),
    testMode: bool(process.env.EMAIL_TEST_MODE) || process.env.VERCEL_ENV === "preview",
    testTo: clean(process.env.EMAIL_TEST_TO),
    siteUrl: siteUrl(),
    environment: clean(process.env.VERCEL_ENV || process.env.NODE_ENV) || "local",
  };
}

function recipientFor(kind) {
  const config = emailConfig();
  const productionRecipient = {
    contact: config.contactTo,
    rfq: config.rfqTo,
    supplier: config.supplierTo,
    partnership: config.partnershipTo,
    tender: config.tenderTo,
  }[kind] || config.contactTo;

  if (config.testMode && config.testTo) return config.testTo;
  return productionRecipient;
}

module.exports = {
  emailConfig,
  recipientFor,
};
