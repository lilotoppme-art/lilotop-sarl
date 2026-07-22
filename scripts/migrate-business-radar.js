const fs = require("fs");
const path = require("path");
const { query } = require("../lib/business-radar/db");

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "001_business_radar.sql"), "utf8");
  await query(sql);
  console.log("Business Radar database migration completed.");
  process.exit(0);
})().catch((error) => {
  console.error(`Business Radar migration failed: ${error.code || error.message}`);
  process.exit(1);
});
