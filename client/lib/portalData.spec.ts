import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profile = { id: "student-1", email: "student@example.com", full_name: "Student", role: "student" };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});
const htmlFallback = () => new Response("<!doctype html><html><body>EduLearnX</body></html>", {
  status: 200,
  headers: { "Content-Type": "text/html; charset=utf-8" },
});

describe("cookie account sessions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", { localStorage: { removeItem: vi.fn() }, dispatchEvent: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does not trust a previous browser profile when the API reports no session", async () => {
    const getItem = vi.fn(() => JSON.stringify({ ...profile, role: "admin" }));
    window.localStorage.getItem = getItem;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ success: false, error: "Authentication required" }, 401)));
    const auth = await import("./portalData");
    expect(auth.getCurrentPortalUser()).toBeNull();
    await auth.initializePortalAuth();
    expect(auth.getCurrentPortalUser()).toBeNull();
    expect(getItem).not.toHaveBeenCalled();
  });

  it("treats a static-host HTML API fallback as signed out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlFallback()));
    const auth = await import("./portalData");
    await expect(auth.initializePortalAuth()).resolves.toBeNull();
    expect(auth.usePortalAuth).toBeDefined();
    expect(auth.getCurrentPortalUser()).toBeNull();
  });

  it("does not let an older session restore overwrite a later sign-in", async () => {
    let finishRestore!: (value: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishRestore = resolve; }))
      .mockResolvedValueOnce(response({ success: true, data: profile }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = await import("./portalData");
    const restore = auth.initializePortalAuth();
    await auth.signInPortal(" Student@Example.com ", "password123");
    finishRestore(response({ success: false }, 401));
    await restore;
    expect(auth.getCurrentPortalUser()?.id).toBe("student-1");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/login");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: "student@example.com", password: "password123" });
  });

  it("lands a restricted co-admin on an allowed area", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ success: true, data: { ...profile, role: "admin" } }))
      .mockResolvedValueOnce(response({ success: true, data: { permissions: { courses: true, overview: false } } })));
    const auth = await import("./portalData");
    const user = await auth.signInPortal(profile.email, "password123");
    expect(auth.portalPathForRole(user.role)).toBe("/admin/courses");
  });

  it("keeps a session visible when the server fails to log it out", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ success: true, data: profile }))
      .mockResolvedValueOnce(response({ success: false, error: "Logout unavailable" }, 503)));
    const auth = await import("./portalData");
    await auth.signInPortal(profile.email, "password123");
    await expect(auth.signOutPortal()).rejects.toThrow("Logout unavailable");
    expect(auth.getCurrentPortalUser()?.id).toBe(profile.id);
  });

  it("reports missing email configuration rather than pretending reset email was sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ success: false, error: "Password reset email is not configured" }, 503)));
    const auth = await import("./portalData");
    await expect(auth.requestPasswordReset(profile.email)).rejects.toThrow("email is not configured");
  });
});
