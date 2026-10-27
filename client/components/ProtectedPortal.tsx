import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { normalizeAdminPermissions, type AdminFeature } from "../../shared/adminPermissions";
import { adminLandingPath, initializePortalAuth, portalPathForRole, usePortalAuth, type PortalRole } from "@/lib/portalData";
import { readApiResponse } from "@/lib/api";

type ProtectedPortalProps = {
  children: ReactNode;
  role: PortalRole;
  feature?: AdminFeature;
};

type AccessCheck = { userId: number | string; feature: AdminFeature; allowed: boolean; landing: string; error: string };

export default function ProtectedPortal({ children, role, feature }: ProtectedPortalProps) {
  const location = useLocation();
  const { user, isLoading, error } = usePortalAuth();
  const [access, setAccess] = useState<AccessCheck | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!feature || !user || user.role !== "admin") return;
    let cancelled = false;
    setAccess(null);
    const verify = async () => {
      try {
        const response = await fetch("/api/admin/permissions/me", { cache: "no-store" });
        const payload = await readApiResponse(response);
        if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to verify admin access.");
        const permissions = normalizeAdminPermissions(payload.data?.permissions);
        if (!cancelled) setAccess({ userId: user.id, feature, allowed: permissions[feature], landing: adminLandingPath(permissions), error: "" });
      } catch (checkError) {
        if (!cancelled) setAccess({ userId: user.id, feature, allowed: false, landing: "/", error: checkError instanceof Error ? checkError.message : "Unable to verify admin access." });
      }
    };
    void verify();
    return () => { cancelled = true; };
  }, [feature, user?.id, user?.role, retry]);

  if (isLoading) return <div role="status" className="p-8">Restoring your account session...</div>;
  if (error) return <div role="alert" className="p-8"><p>{error}</p><button className="btn-primary mt-4" onClick={() => { void initializePortalAuth().catch(() => undefined); }}>Retry session</button></div>;
  if (!user) return <Navigate to="/signin" replace state={{ redirectTo: location.pathname }} />;
  if (user.role !== role) return <Navigate to={portalPathForRole(user.role)} replace />;
  if (feature) {
    if (!access || access.feature !== feature || access.userId !== user.id) return <div role="status" className="p-8">Checking admin access...</div>;
    if (access.error) return <div role="alert" className="p-8"><p>{access.error}</p><button className="btn-primary mt-4" onClick={() => setRetry((value) => value + 1)}>Retry access check</button></div>;
    if (!access.allowed) return <Navigate to={access.landing === location.pathname ? "/" : access.landing} replace state={{ deniedFrom: location.pathname }} />;
  }
  return <>{children}</>;
}
