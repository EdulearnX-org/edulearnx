import { useSyncExternalStore } from "react";
import {
  PRIMARY_ADMIN_EMAIL,
  normalizeAdminPermissions,
  type AdminPermissions,
} from "../../shared/adminPermissions";
import { readApiResponse } from "./api";

export const ADMIN_EMAIL = PRIMARY_ADMIN_EMAIL;
export type PortalRole = "admin" | "teacher" | "student";
export type PortalUser = {
  id: number | string;
  email: string;
  name: string;
  role: PortalRole;
  phone?: string;
  profile_image_url?: string;
  permissions?: AdminPermissions;
  signedInAt: string;
};

type AuthState = { user: PortalUser | null; isLoading: boolean; error: string };
let authState: AuthState = { user: null, isLoading: true, error: "" };
let sessionGeneration = 0;
let initialSessionRequest: Promise<PortalUser | null> | undefined;
const listeners = new Set<() => void>();

function publish(next: AuthState) {
  authState = next;
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    // Retire the old profile cache. Authentication now comes only from the API cookie.
    try { window.localStorage.removeItem("edulearnx:portal-session"); } catch { /* Storage can be disabled. */ }
    window.dispatchEvent(new Event("edulearnx-auth-change"));
    window.dispatchEvent(new Event("edulearnx-data-change"));
  }
}

export function usePortalAuth() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => authState,
    () => authState,
  );
}

export function getCurrentPortalUser() {
  return authState.user;
}

export function clearPortalSession() {
  sessionGeneration += 1;
  initialSessionRequest = undefined;
  publish({ user: null, isLoading: false, error: "" });
}

async function authRequest(path: string, body?: unknown) {
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await readApiResponse(response);
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Unable to complete the account request.");
  }
  return payload;
}

async function profileFromResponse(profile: Record<string, unknown>): Promise<PortalUser> {
  if (!profile?.id || typeof profile.email !== "string" ||
      !["admin", "teacher", "student"].includes(String(profile.role))) {
    throw new Error("The server returned an invalid account profile.");
  }
  const user: PortalUser = {
    id: profile.id as number | string,
    email: profile.email,
    name: String(profile.full_name ?? ""),
    role: profile.role as PortalRole,
    phone: typeof profile.phone === "string" ? profile.phone : undefined,
    profile_image_url: typeof profile.profile_image_url === "string" ? profile.profile_image_url : undefined,
    signedInAt: new Date().toISOString(),
  };
  if (user.role === "admin") {
    const response = await fetch("/api/admin/permissions/me", { credentials: "same-origin", cache: "no-store" });
    const payload = await readApiResponse(response);
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Unable to load admin permissions.");
    }
    user.permissions = normalizeAdminPermissions(payload.data?.permissions);
  }
  return user;
}

export function adminLandingPath(permissions?: AdminPermissions) {
  const destinations = [
    ["overview", "/admin"],
    ["users", "/admin/students"],
    ["courses", "/admin/courses"],
    ["liveClasses", "/admin/live-classes"],
    ["deals", "/admin/deals"],
    ["enrollmentRequests", "/admin/enrollment-requests"],
    ["tutorApplications", "/admin/tutor-applications"],
    ["settings", "/admin/settings"],
  ] as const;
  return destinations.find(([feature]) => permissions?.[feature])?.[1] ?? "/";
}

export function portalPathForRole(role: PortalRole) {
  if (role === "admin") return adminLandingPath(authState.user?.permissions);
  return role === "teacher" ? "/teacher" : "/student";
}

export function updateCurrentPortalUser(updates: Partial<PortalUser>) {
  if (!authState.user) return null;
  const user = { ...authState.user, name: updates.name ?? authState.user.name,
    phone: updates.phone ?? authState.user.phone,
    profile_image_url: updates.profile_image_url ?? authState.user.profile_image_url };
  publish({ user, isLoading: false, error: "" });
  return user;
}

async function establishSession(path: "login" | "register", body: unknown) {
  const generation = ++sessionGeneration;
  initialSessionRequest = undefined;
  const payload = await authRequest(path, body);
  const user = await profileFromResponse(payload.data);
  if (generation !== sessionGeneration) throw new Error("The account session changed. Please try again.");
  publish({ user, isLoading: false, error: "" });
  return user;
}

export function signInPortal(email: string, password: string) {
  return establishSession("login", { email: email.trim().toLowerCase(), password });
}

export function registerPortal(email: string, password: string, fullName: string) {
  return establishSession("register", { email: email.trim().toLowerCase(), password, full_name: fullName.trim() });
}

export async function signOutPortal() {
  await authRequest("logout", {});
  clearPortalSession();
}

export async function requestPasswordReset(email: string) {
  return authRequest("forgot-password", { email: email.trim().toLowerCase() });
}

export async function resetPortalPassword(token: string, password: string) {
  await authRequest("reset-password", { token, password });
  clearPortalSession();
}

export function initializePortalAuth() {
  if (initialSessionRequest) return initialSessionRequest;
  const generation = sessionGeneration;
  publish({ ...authState, isLoading: true, error: "" });
  initialSessionRequest = (async () => {
    try {
      const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      const payload = await readApiResponse(response);
      if (response.status === 401) {
        if (generation === sessionGeneration) publish({ user: null, isLoading: false, error: "" });
        return null;
      }
      // A static SPA host can rewrite an unavailable API route to index.html.
      // Treat that response as signed out so public pages remain usable and
      // protected routes can redirect to sign-in instead of showing raw host errors.
      if (payload.apiFallback) {
        if (generation === sessionGeneration) publish({ user: null, isLoading: false, error: "" });
        return null;
      }
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to restore your account session.");
      const user = await profileFromResponse(payload.data);
      if (generation === sessionGeneration) publish({ user, isLoading: false, error: "" });
      return user;
    } catch (error) {
      if (generation === sessionGeneration) {
        publish({ user: null, isLoading: false, error: error instanceof Error ? error.message : "Unable to restore your account session." });
        initialSessionRequest = undefined;
      }
      throw error;
    }
  })();
  return initialSessionRequest;
}
