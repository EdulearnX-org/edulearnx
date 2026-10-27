import { getCurrentPortalUser, usePortalAuth } from "@/lib/portalData";

export function useCurrentUser() {
  return usePortalAuth().user;
}

export function getCurrentUser() {
  return getCurrentPortalUser();
}
