import { useLiveClasses, localLiveClassWindowLabel } from "@/hooks/useLiveClasses";
import AdminShell from "@/pages/admin/AdminShell";
import { Link } from "react-router-dom";
import { Video } from "lucide-react";

const statusStyles = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  completed: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export default function AdminLiveClasses() {
  const { liveClasses, isLoading, error } = useLiveClasses();

  return (
    <AdminShell title="Live Classes" subtitle="View classes across all courses and join active sessions.">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">Live Classes</h1>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Browse scheduled sessions across the school. Active classes can be joined from here.
          </p>
        </header>

        {isLoading ? (
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Loading live classes...</p>
        ) : error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        ) : liveClasses.length === 0 ? (
          <section className="rounded-lg border border-slate-300 bg-white p-6 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            No live classes have been scheduled.
          </section>
        ) : (
          <section className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-300 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {liveClasses.map((liveClass) => (
              <article key={liveClass.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-950 dark:text-white">{liveClass.title}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusStyles[liveClass.status]}`}>
                      {liveClass.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    {liveClass.course_title || "Course unavailable"} · {liveClass.teacher_name || "Teacher not assigned"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {localLiveClassWindowLabel(liveClass)}
                  </p>
                </div>
                {liveClass.can_join ? (
                  <Link
                    to={`/live-class/${liveClass.id}`}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <Video className="h-4 w-4" /> Join Class
                  </Link>
                ) : (
                  <span className="shrink-0 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {liveClass.status === "scheduled" ? "Waiting for teacher" : "Not joinable"}
                  </span>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </AdminShell>
  );
}