import { afterEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db/connection.js", () => ({ query: database.query }));
import * as live from "./liveClasses.js";
import { PRIMARY_ADMIN_EMAIL } from "../../shared/adminPermissions.js";

function response() {
  return { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
}

afterEach(() => vi.resetAllMocks());

describe("live class admin permissions", () => {
  it.each([
    ["list", live.getLiveClasses], ["create", live.createLiveClass],
    ["update", live.updateLiveClass], ["delete", live.deleteLiveClass],
    ["start", live.startLiveClass], ["end", live.endLiveClass],
    ["status", live.getLiveClassStatus], ["join", live.joinLiveClass],
    ["token", live.createVideoSdkToken], ["leave", live.leaveLiveClass],
  ])("denies a co-admin without liveClasses permission for %s", async (_name, handler) => {
    database.query.mockResolvedValue({ rows: [{ id: 7, email: "coadmin@example.test", role: "admin", is_active: true, admin_permissions: { liveClasses: false } }] });
    const res = response();
    await handler({ user: { userId: 7 }, params: { id: 9 }, body: {}, query: {} } as any, res as any, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it.each(["permitted co-admin", "primary admin"])("allows a %s to manage classes", async (kind) => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 7, email: kind === "primary admin" ? PRIMARY_ADMIN_EMAIL : "coadmin@example.test", role: "admin", is_active: true, admin_permissions: { liveClasses: kind !== "primary admin" } }] }).mockResolvedValueOnce({ rows: [{ id: 9 }] });
    const res = response();
    await live.deleteLiveClass({ user: { userId: 7 }, params: { id: 9 } } as any, res as any, vi.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
