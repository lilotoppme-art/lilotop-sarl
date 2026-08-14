"use strict";

const fs = require("fs");
const path = require("path");
const { extractTenderTableDocument } = require("../lib/nexus/tender-response-documents");
const { buildSupplierCycle } = require("../lib/nexus/unops-malawi-rfq");

async function main() {
  const source = path.join(__dirname, "..", "tmp", "itb-2026-62389", "Section-II-Schedule.pdf");
  if (!fs.existsSync(source)) throw new Error("Official UNOPS Schedule of Requirements is unavailable");
  const extracted = await extractTenderTableDocument({ filename: path.basename(source), buffer: fs.readFileSync(source) });
  const cycle = buildSupplierCycle(extracted.text, {}, new Date());
  const selected = cycle.rfqs.filter((rfq) => rfq.sendRecommendation === "OUI");
  process.stdout.write(JSON.stringify(selected));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
