const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PBKDF2_ITERATIONS = 120000;
const PBKDF2_LENGTH = 32;
const PBKDF2_DIGEST = "sha256";

const PRIMARY_USERS_FILE = path.join(__dirname, "auth-users.json");
const BACKUP_USERS_FILE = path.join(__dirname, "auth-users.backup.json");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password || ""), salt, PBKDF2_ITERATIONS, PBKDF2_LENGTH, PBKDF2_DIGEST).toString("hex");
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function readUsersFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function configuredUsers() {
  if (process.env.AUTO_PHOTOSHOP_USERS) {
    try {
      const parsed = JSON.parse(process.env.AUTO_PHOTOSHOP_USERS);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to file-based users.
    }
  }

  try {
    return readUsersFile(PRIMARY_USERS_FILE);
  } catch {
    return readUsersFile(BACKUP_USERS_FILE);
  }
}

function verifyLogin(email, password) {
  const normalized = normalizeEmail(email);
  const user = configuredUsers().find((item) => normalizeEmail(item.email) === normalized);
  if (!user || !user.salt || !user.hash) return false;

  const candidate = hashPassword(password, user.salt);
  return timingSafeEqualHex(candidate, user.hash);
}

function createSession(email) {
  const payload = {
    email: normalizeEmail(email),
    exp: Date.now() + 1000 * 60 * 60 * 12,
    nonce: crypto.randomBytes(12).toString("hex")
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

module.exports = {
  hashPassword,
  verifyLogin,
  createSession,
  configuredUsers
};
