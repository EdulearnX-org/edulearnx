import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({}));
vi.mock("pg", () => ({
  Pool: class { on = vi.fn(); query = vi.fn(); connect = vi.fn(); },
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class { on = vi.fn(); query = vi.fn(); connect = vi.fn(); },
  neonConfig: {},
}));
vi.mock("ws", () => ({
  default: class {
    constructor(public address: string, public protocols: unknown, public options: unknown) {}
  },
}));

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("database transport", () => {
  it("uses the Neon session-capable pool only for Neon hosts", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:password@ep-example.neon.tech/database");
    const { default: pool, usesNeonTransport } = await import("./connection.js");
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    expect(pool).toBeInstanceOf(Pool);
    expect(neonConfig.poolQueryViaFetch).toBe(false);
    expect(usesNeonTransport("postgresql://test@neon.tech.attacker.example/database")).toBe(false);
    expect(usesNeonTransport("invalid")).toBe(false);
  });

  it("keeps the native PostgreSQL pool for local or other database hosts", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:password@localhost/database");
    const { default: pool } = await import("./connection.js");
    const { Pool } = await import("pg");
    expect(pool).toBeInstanceOf(Pool);
  });

  it("uses the HTTPS proxy for WebSockets without weakening TLS verification", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:password@ep-example.neon.tech/database");
    vi.stubEnv("https_proxy", "http://127.0.0.1:8080");
    vi.stubEnv("no_proxy", "");
    vi.stubEnv("NO_PROXY", "");
    await import("./connection.js");
    const { neonConfig } = await import("@neondatabase/serverless");
    const Socket = neonConfig.webSocketConstructor as any;
    const socket = new Socket("wss://ep-example.neon.tech/v2");
    expect(socket.options.agent).toBeDefined();
    expect(socket.options.rejectUnauthorized).not.toBe(false);
  });

  it("honors exact, domain and port-specific NO_PROXY exclusions", async () => {
    const { webSocketProxy } = await import("./connection.js");
    vi.stubEnv("https_proxy", "http://127.0.0.1:8080");
    vi.stubEnv("no_proxy", "localhost,.internal.example,ep-example.neon.tech:443");
    expect(webSocketProxy("wss://ep-example.neon.tech/v2")).toBeUndefined();
    expect(webSocketProxy("wss://db.internal.example/v2")).toBeUndefined();
    expect(webSocketProxy("wss://ep-example.neon.tech:444/v2")).toBe("http://127.0.0.1:8080");
    expect(webSocketProxy("wss://notinternal.example/v2")).toBe("http://127.0.0.1:8080");
  });
});
