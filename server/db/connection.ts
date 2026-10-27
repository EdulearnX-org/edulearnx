import { Pool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import "../env.js";

const connectionString = process.env.DATABASE_URL ?? "";

export const isDatabaseConfigured = Boolean(connectionString);

export function usesNeonTransport(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export function webSocketProxy(url: string) {
  const target = new URL(url);
  const exclusions = (process.env.no_proxy || process.env.NO_PROXY || "").split(/[\s,]+/);
  const bypass = exclusions.some((entry) => {
    if (!entry) return false;
    if (entry === "*") return true;
    const [hostname, port] = entry.toLowerCase().split(":");
    if (port && port !== (target.port || "443")) return false;
    const domain = hostname.replace(/^\*?\./, "");
    return target.hostname.toLowerCase() === domain ||
      ((hostname.startsWith(".") || hostname.startsWith("*.")) && target.hostname.toLowerCase().endsWith(`.${domain}`));
  });
  return bypass ? undefined : process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
}

class CloudWebSocket extends WebSocket {
  constructor(address: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions) {
    const proxy = webSocketProxy(String(address));
    super(address, protocols, { ...options, ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}) });
  }
}

const options = {
  connectionString: connectionString || undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl:
    process.env.NODE_ENV === "production" && connectionString
      ? { rejectUnauthorized: true }
      : undefined,
};

let pool: Pool;
if (usesNeonTransport(connectionString)) {
  // WebSocket queries and connected clients share the node-postgres API, so
  // interactive transactions remain on a single database session over TLS.
  neonConfig.webSocketConstructor = CloudWebSocket;
  neonConfig.poolQueryViaFetch = false;
  pool = new NeonPool(options) as unknown as Pool;
} else {
  pool = new Pool(options);
}

pool.on("error", (error: Error & { code?: string }) => {
  console.error("Database pool error:", error.code || error.name);
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export default pool;
