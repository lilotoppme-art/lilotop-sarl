const { spawnSync } = require("child_process");

const files = [
  "build-site.js",
  "script.js",
  "audit-links.js",
  "api/contact.js",
  "api/rfq.js",
  "api/portal.js",
  "lib/email/config.js",
  "lib/email/resend.js",
  "lib/email/sendWebsiteEmail.js",
  "tests/forms.test.js",
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("lint ok");
