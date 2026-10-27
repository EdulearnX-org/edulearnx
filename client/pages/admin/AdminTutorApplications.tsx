import DashboardCard from "@/components/DashboardCard";
import { useTutorApplications } from "@/hooks/useTutorApplications";
import { getCurrentPortalUser } from "@/lib/portalData";
import { CheckCircle2, School, XCircle } from "lucide-react";
import { useState } from "react";
import AdminShell from "./AdminShell";

export default function AdminTutorApplications() {
  const currentUser = getCurrentPortalUser();
  const { applications, isLoading, error, reload } = useTutorApplications();
  const [reviewError, setReviewError] = useState("");

  const reviewTutorApplication = async (applicationId: number, status: "approved" | "rejected") => {
    try {
      setReviewError("");
      const response = await fetch(`/api/tutor-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewed_by: currentUser?.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to review tutor application.");
      }
      await reload();
      window.dispatchEvent(new Event("edulearnx-data-change"));
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Unable to review tutor application.");
    }
  };

  return (
    <AdminShell title="Tutor Applications" subtitle="Approve applicants to create teacher portal access.">
      <DashboardCard title="Tutor Applications" icon={<School size={22} />}>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading tutor applications...</p>
        ) : error ? (
          <p className="rounded-xl bg-red-500/10 p-4 text-sm font-semibold text-red-200">{error}</p>
        ) : applications.length === 0 ? (
          <p className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">No tutor applications in the database.</p>
        ) : (
          <div className="space-y-4">
            {reviewError && <p className="rounded-xl bg-red-500/10 p-4 text-sm font-semibold text-red-200">{reviewError}</p>}
            {applications.map((application) => (
              <div key={application.id} className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{application.full_name}</p>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize text-blue-100">{application.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    {application.email}{application.phone ? ` | ${application.phone}` : ""}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-purple-100">{application.expertise} | {application.experience_years} years</p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{application.bio}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[application.certificate_1, application.certificate_2, application.certificate_3].map((certificate, index) => certificate && (
                      <a key={index} href={certificate} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-500/25 hover:text-white">
                        Certificate {index + 1}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 lg:items-center">
                  <button disabled={application.status !== "pending"} onClick={() => reviewTutorApplication(application.id, "approved")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    <CheckCircle2 className="h-4 w-4" /> Approve Teacher
                  </button>
                  <button disabled={application.status !== "pending"} onClick={() => reviewTutorApplication(application.id, "rejected")} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </AdminShell>
  );
}
