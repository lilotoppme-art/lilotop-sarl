const fs = require("fs");
const path = require("path");
const { query } = require("../lib/business-radar/db");

(async () => {
  const directory = path.join(__dirname, "..", "db", "migrations");
  const files = fs.readdirSync(directory).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of files) {
    await query(fs.readFileSync(path.join(directory, file), "utf8"));
    console.log(`Business Radar migration applied: ${file}`);
  }
  console.log("Business Radar database migrations completed.");
  process.exit(0);
})().catch((error) => {
  console.error(`Business Radar migration failed: ${error.code || error.message}`);
  process.exit(1);
});
