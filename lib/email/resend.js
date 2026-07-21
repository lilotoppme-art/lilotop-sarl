const { emailConfig } = require("./config");

function createResendClient() {
  const config = emailConfig();
  if (!config.apiKey) {
    const error = new Error("RESEND_API_KEY is not configured");
    error.code = "EMAIL_SERVICE_NOT_CONFIGURED";
    throw error;
  }

  try {
    const { Resend } = require("resend");
    const resend = new Resend(config.apiKey);
    return {
      send: (payload) => resend.emails.send(payload),
    };
  } catch {
    return {
      async send(payload) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error("Resend delivery failed");
          error.code = "RESEND_DELIVERY_FAILED";
          error.status = response.status;
          error.details = body;
          throw error;
        }
        return { data: body, error: null };
      },
    };
  }
}

module.exports = {
  createResendClient,
};
