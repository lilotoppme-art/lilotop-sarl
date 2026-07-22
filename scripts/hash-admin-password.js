const readline = require("readline");
const { hashPassword } = require("../lib/business-radar/auth");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Enter the initial Business Radar administrator password: ", (password) => {
  if (password.length < 14) { console.error("Password must contain at least 14 characters."); process.exitCode = 1; }
  else console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
  rl.close();
});
