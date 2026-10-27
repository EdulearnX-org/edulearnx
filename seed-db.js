import { spawn } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

function connectionConfig(connectionString, label) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${label} database URL is invalid.`);
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${label} database URL must use PostgreSQL.`);
  }

  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
  };

  const supportedOptions = new Map([
    ["application_name", "PGAPPNAME"],
    ["channel_binding", "PGCHANNELBINDING"],
    ["connect_timeout", "PGCONNECT_TIMEOUT"],
    ["options", "PGOPTIONS"],
    ["sslcert", "PGSSLCERT"],
    ["sslkey", "PGSSLKEY"],
    ["sslrootcert", "PGSSLROOTCERT"],
    ["target_session_attrs", "PGTARGETSESSIONATTRS"],
  ]);

  for (const [key, value] of url.searchParams) {
    if (key === "sslmode") continue;
    const variable = supportedOptions.get(key);
    if (!variable) {
      throw new Error(`${label} URL contains an unsupported PostgreSQL option: ${key}.`);
    }
    env[variable] = value;
  }

  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key];
  }

  return {
    env,
    identity: `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`,
  };
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function getTables(client) {
  const { rows } = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_schema NOT LIKE 'pg_toast%'
    ORDER BY table_schema, table_name
  `);
  return rows;
}

async function getRowCounts(client, tables) {
  const counts = new Map();
  for (const { table_schema, table_name } of tables) {
    const table = `${quoteIdentifier(table_schema)}.${quoteIdentifier(table_name)}`;
    const { rows } = await client.query(`SELECT count(*)::text AS count FROM ${table}`);
    counts.set(`${table_schema}.${table_name}`, rows[0].count);
  }
  return counts;
}

function start(program, args, env) {
  return spawn(program, args, { env, stdio: ["pipe", "pipe", "pipe"] });
}

function collectStream(stream) {
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  return new Promise((resolve, reject) => {
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
  });
}

function waitForExit(child, program) {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new Error(`Unable to start ${program}: ${error.message}`)));
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${program} failed${signal ? ` (${signal})` : ` with exit code ${code}`}.`));
    });
  });
}

function getFailureCategory(message) {
  if (/server version mismatch|unsupported version/i.test(message)) return "version mismatch";
  if (/permission denied|must be owner|not authorized/i.test(message)) return "permission error";
  if (/already exists|duplicate key/i.test(message)) return "object or data conflict";
  if (/does not exist|undefined table|undefined object/i.test(message)) return "missing database object";
  if (/violates .* constraint/i.test(message)) return "constraint violation";
  if (/connection to server failed|could not connect|connection refused/i.test(message)) {
    return "connection error";
  }
  if (/input file does not appear|invalid magic number|unsupported version/i.test(message)) {
    return "invalid dump archive";
  }
  return "";
}

function getSafeUtilityDiagnostic(message) {
  const errorLine = message
    .split("\n")
    .find((line) => /^(pg_dump|pg_restore): error:/i.test(line));
  return errorLine
    ?.replace(/'[^']*'|"[^"]*"/g, "[redacted]")
    .slice(0, 240);
}

async function transfer(source, target) {
  const dump = start("pg_dump", ["--format=custom", "--no-owner", "--no-privileges"], source.env);
  const restore = start(
    "pg_restore",
    [
      "--dbname",
      target.env.PGDATABASE,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--single-transaction",
    ],
    target.env,
  );
  const dumpError = collectStream(dump.stderr);
  const restoreError = collectStream(restore.stderr);
  const processes = Promise.all([
    waitForExit(dump, "pg_dump"),
    waitForExit(restore, "pg_restore"),
  ]);

  dump.stdout.pipe(restore.stdin);
  dump.stdout.once("error", (error) => restore.stdin.destroy(error));
  restore.stdin.once("error", (error) => dump.kill("SIGTERM"));

  try {
    await processes;
  } catch (error) {
    dump.kill("SIGTERM");
    restore.kill("SIGTERM");
    await Promise.allSettled([processes, dumpError, restoreError]);
    const [dumpMessage, restoreMessage] = await Promise.all([dumpError, restoreError]);
    const utilityOutput = `${dumpMessage}\n${restoreMessage}`;
    const category = getFailureCategory(utilityOutput);
    const diagnostic = getSafeUtilityDiagnostic(utilityOutput);
    const baseMessage = error.message.replace(/\.+$/, "");
    throw new Error(
      `${baseMessage}${category ? ` (${category})` : ""}${diagnostic ? `: ${diagnostic}` : ""}.`,
    );
  }

  const [dumpMessage, restoreMessage] = await Promise.all([dumpError, restoreError]);
  if (dumpMessage || restoreMessage) {
    console.warn("PostgreSQL tools reported warnings; migration completed.");
  }
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error("Set DATABASE_URL and TARGET_DATABASE_URL in .env before running this script.");
  }

  const source = connectionConfig(sourceUrl, "Source");
  const target = connectionConfig(targetUrl, "Target");
  if (source.identity === target.identity) {
    throw new Error("Source and target identify the same database; refusing to continue.");
  }

  const sourceClient = new pg.Client({ connectionString: sourceUrl });
  const targetClient = new pg.Client({ connectionString: targetUrl });
  try {
    await Promise.all([sourceClient.connect(), targetClient.connect()]);
    const { rows: existingObjects } = await targetClient.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_schema NOT LIKE 'pg_toast%'
    `);
    if (existingObjects.some(({ table_schema }) => table_schema !== "public")) {
      throw new Error("Target contains objects outside the public schema; refusing to replace it.");
    }

    const targetTablesBeforeMigration = await getTables(targetClient);
    const targetCountsBeforeMigration = await getRowCounts(
      targetClient,
      targetTablesBeforeMigration,
    );
    const nonEmptyTargetTables = [...targetCountsBeforeMigration].filter(
      ([, count]) => count !== "0",
    );
    if (nonEmptyTargetTables.length) {
      throw new Error(
        `Target contains data in ${nonEmptyTargetTables.length} table(s); refusing to overwrite it.`,
      );
    }

    const sourceTables = await getTables(sourceClient);
    const sourceCounts = await getRowCounts(sourceClient, sourceTables);
    await targetClient.query("DROP SCHEMA IF EXISTS public CASCADE");
    await targetClient.query("CREATE SCHEMA public AUTHORIZATION CURRENT_USER");
    await transfer(source, target);

    const targetTables = await getTables(targetClient);
    const targetCounts = await getRowCounts(targetClient, targetTables);
    const sourceTableNames = new Set(sourceCounts.keys());
    const missingTables = sourceTables.filter(
      ({ table_schema, table_name }) => !targetCounts.has(`${table_schema}.${table_name}`),
    );
    const extraTables = [...targetCounts.keys()].filter((table) => !sourceTableNames.has(table));
    const mismatchedCounts = [...sourceCounts].filter(
      ([table, count]) => targetCounts.get(table) !== count,
    );

    if (missingTables.length || extraTables.length || mismatchedCounts.length) {
      throw new Error(
        `Post-restore verification failed (${missingTables.length} missing tables, ${extraTables.length} extra tables, ${mismatchedCounts.length} row-count mismatches).`,
      );
    }

    console.log(
      `Migration complete. Verified ${sourceTables.length} tables and ${sourceCounts.size} exact row counts.`,
    );
  } finally {
    await Promise.all([
      sourceClient.end().catch(() => {}),
      targetClient.end().catch(() => {}),
    ]);
  }
}

main().catch((error) => {
  console.error(`Database migration failed: ${error.message}`);
  process.exitCode = 1;
});
