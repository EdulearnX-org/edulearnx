import DashboardCard from "@/components/DashboardCard";
import { useEnrollmentRequests } from "@/hooks/useEnrollmentRequests";
import { getCurrentPortalUser } from "@/lib/portalData";
import { CheckCircle2, Clock, ExternalLink, RotateCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import AdminShell from "./AdminShell";

export default function AdminEnrollmentRequests() {
  const currentUser = getCurrentPortalUser();
  const { requests, isLoading, error, reload } = useEnrollmentRequests();
  const [reviewError, setReviewError] = useState("");
  const [receiptUrls, setReceiptUrls] = useState<Record<string, { url: string; expiresAt: number }>>({});
  const [loadingReceipt, setLoadingReceipt] = useState<string | null>(null);
  const [retryingCleanup, setRetryingCleanup] = useState<string | null>(null);

  useEffect(() => {
    const expirationTimes = Object.values(receiptUrls).map((receipt) => receipt.expiresAt);
    if (!expirationTimes.length) return;
    const timer = window.setTimeout(() => {
      setReceiptUrls((current) => Object.fromEntries(
        Object.entries(current).filter(([, receipt]) => receipt.expiresAt > Date.now()),
      ));
    }, Math.max(0, Math.min(...expirationTimes) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [receiptUrls]);

  const reviewRequest = async (requestId: string | number, status: "approved" | "rejected") => {
    try {
      setReviewError("");
      const response = await fetch(`/api/enrollment-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewed_by: currentUser?.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to review enrollment request.");
      }
      await reload();
      window.dispatchEvent(new Event("edulearnx-data-change"));
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Unable to review enrollment request.");
      await reload();
    }
  };

  const openReceipt = async (requestId: string | number) => {
    try {
      setReviewError("");
      setLoadingReceipt(String(requestId));
      const requestedAt = Date.now();
      const response = await fetch(`/api/enrollment-requests/${requestId}/receipt`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.data?.url) {
        throw new Error(payload.error || "Unable to open payment receipt.");
      }
      const lifetimeSeconds = Number(payload.data.expires_in) || 120;
      setReceiptUrls((current) => ({
        ...current,
        [requestId]: { url: payload.data.url, expiresAt: requestedAt + Math.max(1, lifetimeSeconds - 5) * 1000 },
      }));
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Unable to open payment receipt.");
    } finally {
      setLoadingReceipt(null);
    }
  };

  const retryCleanup = async (requestId: string | number) => {
    try {
      setReviewError("");
      setRetryingCleanup(String(requestId));
      const response = await fetch(`/api/enrollment-requests/${requestId}/retry-cleanup`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Receipt cleanup failed.");
      }
      await reload();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Receipt cleanup failed.");
      await reload();
    } finally {
      setRetryingCleanup(null);
    }
  };

  return (
    <AdminShell title="Enrollment Requests" subtitle="Review applications and payment receipts.">
      <DashboardCard
        title="Enrollment Applications"
        icon={<Clock size={22} />}
        description="Receipts are private. Opening one creates a short-lived signed link."
      >
        {reviewError && <p className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm font-semibold text-red-200">{reviewError}</p>}
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading requests...</p>
        ) : error ? (
          <p className="rounded-xl bg-red-500/10 p-4 text-sm font-semibold text-red-200">{error}</p>
        ) : requests.length === 0 ? (
          <p className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">No enrollment requests in the database.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div key={request.id} className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{request.student_name}</p>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize text-blue-100">{request.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{request.student_email} requested {request.course_title}</p>
                    <p className="mt-1 text-sm text-slate-300">Phone: {request.student_phone}</p>
                    {request.submission_state === "failed" && (
                      <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                        Receipt upload failed. This application cannot be reviewed.
                      </p>
                    )}
                    {request.transfer_reference && <p className="mt-2 text-sm text-slate-300">Transfer reference: {request.transfer_reference}</p>}
                    {request.sender_account_title && <p className="mt-1 text-sm text-slate-300">Sender account title: {request.sender_account_title}</p>}
                    {request.sender_account_number && <p className="mt-1 text-sm text-slate-300">Sender account number: {request.sender_account_number}</p>}
                    {request.cleanup_status === "failed" && (
                      <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        Receipt deletion failed after {request.cleanup_attempts} attempt(s): {request.cleanup_error || "retry scheduled"}
                      </p>
                    )}
                    {request.cleanup_status === "complete" && (
                      <p className="mt-2 text-sm text-emerald-200">Receipt deleted from private storage.</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 lg:items-center">
                  {request.submission_state === "complete" && request.cleanup_status !== "complete" && (
                    <>
                      {receiptUrls[request.id] && (
                        <a href={receiptUrls[request.id].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-600 px-4 py-2 text-sm font-bold text-white">
                          <ExternalLink className="h-4 w-4" /> Open receipt
                        </a>
                      )}
                      <button disabled={loadingReceipt === String(request.id)} onClick={() => openReceipt(request.id)} className="inline-flex items-center gap-2 rounded-xl bg-slate-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                        <ExternalLink className="h-4 w-4" /> {loadingReceipt === String(request.id) ? "Preparing..." : receiptUrls[request.id] ? "Refresh receipt link" : "View receipt"}
                      </button>
                    </>
                  )}
                  {request.status === "pending" && (
                    <>
                      <button disabled={request.submission_state !== "complete"} onClick={() => reviewRequest(request.id, "approved")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                        <CheckCircle2 className="h-4 w-4" /> Approve & Grant Access
                      </button>
                      <button disabled={request.submission_state !== "complete"} onClick={() => reviewRequest(request.id, "rejected")} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                        <XCircle className="h-4 w-4" /> Reject
                      </button>
                    </>
                  )}
                  {request.cleanup_status === "failed" && (
                    <button disabled={retryingCleanup === String(request.id)} onClick={() => retryCleanup(request.id)} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
                      <RotateCw className="h-4 w-4" /> {retryingCleanup === String(request.id) ? "Retrying..." : "Retry receipt cleanup"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </AdminShell>
  );
}
