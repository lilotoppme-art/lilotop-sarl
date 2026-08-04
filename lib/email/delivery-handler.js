"use strict";

const { verifySession } = require("../business-radar/auth");
const deliveryStore = require("./delivery-store");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (!verifySession(req)) return json(res, 401, { ok: false, error: "Authentication required" });
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const [events, totals] = await Promise.all([deliveryStore.listRecent(100), deliveryStore.summary()]);
    return json(res, 200, { ok: true, data: { events, totals } });
  } catch (error) {
    console.error("[email] delivery journal unavailable", { code: error.code || "DATABASE_ERROR" });
    return json(res, 503, { ok: false, error: "Delivery journal unavailable" });
  }
};
