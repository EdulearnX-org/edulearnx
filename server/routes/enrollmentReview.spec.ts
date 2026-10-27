import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn() }));
vi.mock("../db/connection.js", () => ({ default: { connect: database.connect }, query: database.query }));
import { getPendingEnrollmentRequestCount, reviewEnrollmentRequest } from "./enrollmentRequests.js";

function response() {
  return { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
}

describe("enrollment review durability", () => {
  let application: any;
  let enrolled: boolean;
  let failInsert: boolean;
  let failFinalization: boolean;
  let events: string[];
  let lockTail: Promise<void>;
  let beforeFinalization: (() => Promise<void>) | undefined;

  async function runReview(status: "approved" | "rejected") {
    const res = response();
    await reviewEnrollmentRequest({ params: { id: application.id }, body: { status }, user: { userId: 9 } } as any, res as any, vi.fn());
    return res;
  }

  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://test.invalid");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
    application = { id: "application-1", student_id: "11", course_id: "22", status: "pending", submission_state: "complete", cleanup_status: "none", cleanup_attempts: 0, receipt_path: "11/receipt.pdf" };
    enrolled = false;
    failInsert = false;
    failFinalization = false;
    events = [];
    lockTail = Promise.resolve();
    beforeFinalization = undefined;
    database.connect.mockImplementation(async () => {
      let unlock: (() => void) | undefined;
      let pendingGrant = false;
      return {
        query: vi.fn(async (sql: string) => {
          if (sql === "BEGIN") return { rows: [] };
          if (sql.includes("pg_advisory_xact_lock(")) {
            const previous = lockTail;
            lockTail = new Promise<void>((resolve) => { unlock = resolve; });
            await previous;
          } else if (sql === "COMMIT" || sql === "ROLLBACK") {
            if (sql === "COMMIT" && pendingGrant) {
              enrolled = true;
              events.push("enrollment-committed");
            }
            pendingGrant = false;
            unlock?.();
          } else if (sql.startsWith("INSERT INTO enrollments")) {
            if (failInsert) { failInsert = false; throw new Error("temporary database failure"); }
            pendingGrant = true;
          } else if (sql.startsWith("SELECT id FROM enrollments")) {
            return { rows: enrolled ? [{ id: 1 }] : [] };
          } else throw new Error(`Unexpected SQL: ${sql}`);
          return { rows: [] };
        }),
        release: vi.fn(),
      };
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (init.method === "HEAD") return new Response(null, { headers: { "Content-Range": "0-0/2301" } });
      if (url.pathname.startsWith("/storage/")) {
        events.push("receipt-deleted");
        return Response.json([]);
      }
      if (url.searchParams.has("status") && url.searchParams.get("status") !== `eq.${application.status}`) return Response.json([]);
      if (url.searchParams.has("cleanup_status") && url.searchParams.get("cleanup_status") !== `eq.${application.cleanup_status}`) return Response.json([]);
      if (init.method === "PATCH") {
        const values = JSON.parse(String(init.body));
        if (values.status && beforeFinalization) await beforeFinalization();
        // Conditional PATCH evaluation happens in the remote store after any wait.
        if (url.searchParams.has("status") && url.searchParams.get("status") !== `eq.${application.status}`) return Response.json([]);
        if (values.status && failFinalization) { failFinalization = false; throw new Error("temporary Supabase failure"); }
        if (values.status) events.push(`decision-${values.status}`);
        Object.assign(application, values);
      }
      return Response.json([application]);
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("retains the pending application and receipt when enrollment fails, then retries successfully", async () => {
    failInsert = true;
    expect((await runReview("approved")).statusCode).toBe(500);
    expect(application).toMatchObject({ status: "pending", cleanup_status: "none" });
    expect(enrolled).toBe(false);
    expect(events).not.toContain("receipt-deleted");
    expect((await runReview("approved")).statusCode).toBe(200);
    expect(application).toMatchObject({ status: "approved", cleanup_status: "complete" });
    expect(events).toEqual(["enrollment-committed", "decision-approved", "receipt-deleted"]);
  });

  it("recovers an already committed enrollment when Supabase finalization fails", async () => {
    failFinalization = true;
    expect((await runReview("approved")).statusCode).toBe(500);
    expect(enrolled).toBe(true);
    expect(application).toMatchObject({ status: "pending", cleanup_status: "none" });
    expect(events).not.toContain("receipt-deleted");
    expect((await runReview("approved")).statusCode).toBe(200);
    expect(application.status).toBe("approved");
    expect(events.indexOf("receipt-deleted")).toBeGreaterThan(events.indexOf("decision-approved"));
  });

  it("reconciles a later rejection to approved after access was durably granted", async () => {
    failFinalization = true;
    await runReview("approved");
    const retry = await runReview("rejected");
    expect(retry.statusCode).toBe(200);
    expect(retry.body.data.status).toBe("approved");
    expect(application.status).toBe("approved");
    expect(enrolled).toBe(true);
  });

  it("serializes competing approval and rejection decisions", async () => {
    const [approval, rejection] = await Promise.all([runReview("approved"), runReview("rejected")]);
    expect(approval.statusCode).toBe(200);
    expect([200, 409]).toContain(rejection.statusCode);
    if (rejection.statusCode === 200) expect(rejection.body.data.status).toBe("approved");
    expect(application.status).toBe("approved");
    expect(enrolled).toBe(true);
    expect(events.filter((event) => event === "receipt-deleted")).toHaveLength(1);
  });

  it("reconciles a competing rejection while approval finalization is in flight", async () => {
    let resume!: () => void;
    let paused!: () => void;
    const finalizationPaused = new Promise<void>((resolve) => { paused = resolve; });
    const resumeFinalization = new Promise<void>((resolve) => { resume = resolve; });
    let hasPaused = false;
    beforeFinalization = async () => {
      if (!hasPaused) { hasPaused = true; paused(); await resumeFinalization; }
    };
    const approval = runReview("approved");
    await finalizationPaused;
    expect(enrolled).toBe(true);
    const rejection = await runReview("rejected");
    expect(rejection.statusCode).toBe(200);
    expect(rejection.body.data.status).toBe("approved");
    resume();
    expect((await approval).statusCode).toBe(200);
    expect(application.status).toBe("approved");
    expect(enrolled).toBe(true);
    expect(events.filter((event) => event === "receipt-deleted")).toHaveLength(1);
  });

  it("rejects an application without granting course access", async () => {
    expect((await runReview("rejected")).statusCode).toBe(200);
    expect(application.status).toBe("rejected");
    expect(enrolled).toBe(false);
  });

  it("counts the Supabase queue beyond the REST row limit", async () => {
    expect(await getPendingEnrollmentRequestCount()).toBe(2301);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("submission_state=eq.complete");
    expect(options).toMatchObject({ method: "HEAD", headers: { Prefer: "count=exact" } });
  });
});
