const crypto = require("crypto");

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/hash-password.js user@example.com password");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");

console.log(JSON.stringify({ email, salt, hash }, null, 2));
