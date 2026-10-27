// Exercises the isolated local database, or the configured Neon database with --neon.
// Creates and removes only its own uniquely named test records. Never prints credentials.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

const base = "http://127.0.0.1:5173";
const email = `cloud-smoke-${crypto.randomUUID()}@example.test`;
const password = crypto.randomBytes(24).toString("base64url");
const newPassword = crypto.randomBytes(24).toString("base64url");
let db;
let vite;
if (process.argv.includes("--neon")) {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).hostname.endsWith(".neon.tech")) throw new Error("A configured Neon DATABASE_URL is required.");
  const { createServer } = await import("vite");
  vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true } });
  db = (await vite.ssrLoadModule("/server/db/connection.ts")).default;
} else {
  db = new pg.Client({ connectionString: "postgresql://edulearnx@127.0.0.1:55432/edulearnx" });
  await db.connect();
}
let userId;
let courseId;
let mailId;
let cookie = "";
async function request(path, body, expected = 200, suppliedCookie = cookie) {
  const response = await fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(suppliedCookie ? { Cookie: suppliedCookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.status, expected, `${path}: ${payload.error || response.status}`);
  const setCookie = response.headers.getSetCookie().find(value => value.startsWith("auth_token="));
  if (setCookie) cookie = setCookie.split(";")[0];
  return { payload, setCookie };
}

try {
  await request("/health");
  await request("/health-db");
  const registration = await request("/auth/register", { email, password, full_name: "Cloud smoke", role: "admin" }, 201);
  userId = registration.payload.data.id;
  assert.equal(registration.payload.data.role, "student");
  assert.match(registration.setCookie, /HttpOnly/i);
  assert.match(registration.setCookie, /SameSite=Lax/i);
  const stored = (await db.query("SELECT password_hash FROM users WHERE id=$1", [userId])).rows[0];
  assert.match(stored.password_hash, /^\$2/);
  const rawToken = cookie.split("=")[1];
  const sessions = await db.query("SELECT token_hash FROM auth_sessions WHERE user_id=$1", [String(userId)]);
  assert.equal(sessions.rows[0].token_hash, crypto.createHash("sha256").update(rawToken).digest("hex"));
  assert.equal((await request("/auth/session")).payload.data.email, email);
  await request("/auth/register", { email: email.toUpperCase(), password, full_name: "Duplicate" }, 409);
  await request("/auth/login", { email, password: "incorrect-password" }, 401);
  const oldCookie = cookie;
  await request("/auth/logout", {});
  await request("/auth/session", undefined, 401, oldCookie);
  await request("/auth/login", { email, password });
  const beforeReset = cookie;
  await request("/auth/forgot-password", { email });
  let message;
  for (let i = 0; i < 20; i++) {
    const listing = await (await fetch("http://127.0.0.1:18025/api/v1/messages")).json();
    message = listing.messages?.find(item => item.To?.some(recipient => recipient.Address === email));
    if (message) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(message, "Password reset email reached local SMTP capture");
  mailId = message.ID;
  const mail = await (await fetch(`http://127.0.0.1:18025/api/v1/message/${mailId}`)).json();
  const token = new URL(mail.Text.match(/http[^\s]+\/reset-password\?token=[^\s]+/)[0]).searchParams.get("token");
  await request("/auth/reset-password", { token, password: newPassword });
  await request("/auth/session", undefined, 401, beforeReset);
  await request("/auth/reset-password", { token, password: newPassword }, 400);
  await request("/auth/login", { email, password }, 401);
  await request("/auth/login", { email, password: newPassword });
  const course = await db.query("INSERT INTO courses (title,price_cents,is_published) VALUES ($1,3999,true) RETURNING id", [email]);
  courseId = course.rows[0].id;
  assert.equal((await request(`/courses/${courseId}`)).payload.data.price_cents, 3999);
  await request("/contact", { name: "Cloud smoke", email, subject: "Test", message: "Local integration test" }, 201);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM contact_messages WHERE email=$1", [email])).rows[0].count, 1);
  console.log("PASS: database readiness, signup, hashed credentials/sessions, duplicate-account protection, login, logout revocation, SMTP recovery, single-use reset/session revocation, course price, contact persistence.");
} finally {
  if (mailId) await fetch("http://127.0.0.1:18025/api/v1/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [mailId] }) });
  await db.query("DELETE FROM contact_messages WHERE email=$1", [email]);
  if (courseId) await db.query("DELETE FROM courses WHERE id=$1", [courseId]);
  if (userId) {
    await db.query("DELETE FROM auth_sessions WHERE user_id=$1", [String(userId)]);
    await db.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [String(userId)]);
    await db.query("DELETE FROM users WHERE id=$1 AND email=$2", [userId, email]);
  }
  await db.end();
  if (vite) await vite.close();
}
