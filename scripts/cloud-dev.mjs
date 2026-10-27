import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
dotenv.config({ path: [".env.local", ".env"], quiet: true });
if (process.env.NODE_ENV === "production") throw new Error("cloud:dev is for isolated development only.");
const state = path.resolve(root, "../.edulearnx");
const postgresImage = "postgres@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe";
const mailImage = "axllent/mailpit@sha256:23fe39e81bde596a918000b3135c0f85dc8bb4c9ea6be274b051143f3e300387";
mkdirSync(state, { recursive: true });
function docker(args, quiet = false) {
  return execFileSync("docker", args, { stdio: quiet ? ["ignore", "pipe", "ignore"] : "inherit", encoding: "utf8" });
}
function inspect(kind, name) {
  try { return docker([kind, "inspect", name, "--format", "{{.Id}}"], true).trim(); }
  catch { return null; }
}
function ensureContainer(name, image, args) {
  if (!inspect("image", image)) {
    const archive = path.join(state, "images.tar");
    if (existsSync(archive)) docker(["load", "--input", archive]);
    if (!inspect("image", image)) docker(["pull", image]);
  }
  if (inspect("container", name)) {
    const actual = docker(["container", "inspect", name, "--format", "{{.Config.Image}}"], true).trim();
    if (actual !== image) throw new Error(`Container ${name} uses a different image; preserve it and choose a different development container name.`);
    docker(["start", name], true);
  } else {
    docker(["run", "-d", "--name", name, "--label", "org.edulearnx.cloud-dev=true", ...args, image], true);
  }
}

if (process.argv.includes("--local") || !process.env.DATABASE_URL) {
  const data = path.join(state, "postgres");
  mkdirSync(data, { recursive: true });
  ensureContainer("edulearnx-postgres", postgresImage, [
    "--mount", `type=bind,source=${data},target=/var/lib/postgresql/data`,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_USER=edulearnx", "-e", "POSTGRES_DB=edulearnx",
    "-p", "127.0.0.1:55432:5432",
  ]);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { docker(["exec", "edulearnx-postgres", "pg_isready", "-U", "edulearnx", "-d", "edulearnx"], true); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  if (!ready) throw new Error("Development Postgres did not become ready.");
  // This isolated loopback database has no password; never use this configuration in production.
  process.env.DATABASE_URL = "postgresql://edulearnx@127.0.0.1:55432/edulearnx";
  console.log("Using the isolated local development Postgres database.");
}
if (!process.env.SMTP_HOST) {
  ensureContainer("edulearnx-mailpit", mailImage, ["-p", "127.0.0.1:11025:1025", "-p", "127.0.0.1:18025:8025"]);
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "11025";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_FROM = "EduLearnX Development <noreply@edulearnx.local>";
  console.log("Development password-reset emails are captured locally; external delivery is disabled.");
}
process.env.APP_URL ||= "http://127.0.0.1:5173";
const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], { stdio: "inherit", env: process.env, detached: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  try { process.kill(-child.pid, signal); } catch { /* The development process already exited. */ }
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
