import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "./index";

afterEach(() => vi.unstubAllEnvs());

describe("production CORS startup", () => {
  it("starts a same-origin deployment without CORS_ORIGIN", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ORIGIN", "");
    expect(() => createServer()).not.toThrow();
  });

  it("accepts an explicit origin list", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ORIGIN", "https://edulearnx-upu6.vercel.app,https://example.com");
    expect(() => createServer()).not.toThrow();
  });

  it.each(["*", "https://example.com/path", "https://example.com,"])(
    "rejects invalid explicit configuration %s",
    (origin) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CORS_ORIGIN", origin);
      expect(() => createServer()).toThrow(/CORS_ORIGIN/);
    },
  );
});
