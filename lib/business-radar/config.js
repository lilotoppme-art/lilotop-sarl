function clean(value) {
  return String(value || "").trim();
}

function radarConfig() {
  return {
    databaseUrl: clean(process.env.DATABASE_URL),
    openaiApiKey: clean(process.env.OPENAI_API_KEY),
    openaiModel: clean(process.env.OPENAI_MODEL) || "gpt-5.6-luna",
    alertEmail: clean(process.env.BUSINESS_RADAR_ALERT_EMAIL) || clean(process.env.EMAIL_CONTACT_TO),
    cronSecret: clean(process.env.CRON_SECRET),
    adminEmail: clean(process.env.ADMIN_EMAIL).toLowerCase(),
    adminPasswordHash: clean(process.env.ADMIN_PASSWORD_HASH),
    authSecret: clean(process.env.AUTH_SECRET),
    appUrl: clean(process.env.APP_URL) || clean(process.env.NEXT_PUBLIC_SITE_URL) || "http://127.0.0.1:4173",
  };
}

module.exports = { radarConfig };
