import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import AdminShell from "./AdminShell";
import {
  Activity, AlertTriangle, BarChart3, BookOpen, Download, GraduationCap,
  RefreshCw, Search, ShieldAlert, Users,
} from "lucide-react";

type TeacherMetric = {
  id: number | string;
  teacher_name: string;
  total_classes: number;
  completed_classes: number;
  active_classes: number;
  student_attendances: number;
  avg_student_minutes: number;
};
type StudentMetric = {
  student_id: number | string;
  student_name: string;
  email: string;
  course_id: number | string;
  course_title: string;
  enrolled_at: string;
  progress_percentage: number;
  is_completed: boolean;
  classes_attended: number;
  last_class_attended: string | null;
};
type AnalyticsData = {
  teachers: TeacherMetric[];
  students: StudentMetric[];
  attendance: {
    total_classes: number;
    active_classes: number;
    completed_classes: number;
    student_attendances: number;
    unique_students: number;
  };
  alerts: { lowProgressEnrolments: number; missedClassEnrolments: number };
  generatedAt: string;
};

const panel = "rounded-2xl border border-white/10 bg-slate-950/55 p-5 shadow-xl shadow-black/10 backdrop-blur-xl";
const muted = "text-slate-400";

function Metric({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: ReactNode }) {
  return <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-5">
    <div className="flex items-start justify-between gap-3"><div><p className={`text-sm font-semibold ${muted}`}>{label}</p><p className="mt-3 text-3xl font-black tracking-tight text-white tabular-nums">{value}</p><p className={`mt-1 text-xs ${muted}`}>{detail}</p></div><span className="rounded-xl border border-white/10 bg-white/5 p-3 text-cyan-200">{icon}</span></div>
  </article>;
}

function dateLabel(value: string | null) {
  if (!value) return "No attendance recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function downloadCsv(rows: StudentMetric[]) {
  const columns: Array<keyof StudentMetric> = ["student_name", "email", "course_title", "progress_percentage", "classes_attended", "last_class_attended", "is_completed"];
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [columns.join(","), ...rows.map((row) => columns.map((key) => quote(row[key])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "edulearnx-student-progress.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "teachers" | "students">("overview");
  const [search, setSearch] = useState("");
  const [showAtRisk, setShowAtRisk] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const response = await fetch("/api/admin/analytics", { credentials: "include" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load analytics.");
      setData(payload.data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const students = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.students ?? []).filter((student) => {
      const matches = !query || [student.student_name, student.email, student.course_title].some((value) => value.toLowerCase().includes(query));
      return matches && (!showAtRisk || (!student.is_completed && Number(student.progress_percentage) < 25));
    });
  }, [data, search, showAtRisk]);

  const averageProgress = data?.students.length
    ? Math.round(data.students.reduce((total, student) => total + Number(student.progress_percentage || 0), 0) / data.students.length)
    : 0;

  return <AdminShell title="Advanced analytics" subtitle="Teacher performance, learner progress, attendance and operational alerts.">
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-slate-950 via-indigo-950/80 to-slate-950 p-6 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-100"><Activity className="h-3.5 w-3.5" /> Admin intelligence</div><h1 className="mt-4 text-3xl font-black text-white sm:text-4xl">Learning performance</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Use actual class attendance and recorded course progress to identify learners who may need support and understand teaching activity.</p></div>
          <button type="button" onClick={() => void load()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh reports</button>
        </div>
        {data && <p className="relative mt-5 text-xs text-slate-400">Last generated {new Date(data.generatedAt).toLocaleString()}</p>}
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-300/25 bg-rose-300/10 p-4 text-sm text-rose-100">{error}</div>}
      {loading && !data ? <div className={panel}><p className="text-sm text-slate-300">Loading verified platform reports…</p></div> : data && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Class sessions" value={data.attendance.total_classes} detail={`${data.attendance.completed_classes} completed · ${data.attendance.active_classes} active`} icon={<BookOpen className="h-5 w-5" />} />
          <Metric label="Student attendances" value={data.attendance.student_attendances} detail={`${data.attendance.unique_students} unique students recorded`} icon={<Users className="h-5 w-5" />} />
          <Metric label="Average course progress" value={`${averageProgress}%`} detail={`${data.students.length} enrolled student-course records`} icon={<BarChart3 className="h-5 w-5" />} />
          <Metric label="Teacher accounts reporting" value={data.teachers.length} detail="Teachers with performance records" icon={<GraduationCap className="h-5 w-5" />} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
            <div className="flex items-start gap-3"><span className="rounded-xl bg-amber-300/10 p-3 text-amber-200"><AlertTriangle className="h-5 w-5" /></span><div><h2 className="font-bold text-white">Learners needing attention</h2><p className="mt-1 text-sm text-slate-400">Enrolments below 25% progress after at least 14 days.</p><p className="mt-3 text-3xl font-black text-amber-100 tabular-nums">{data.alerts.lowProgressEnrolments}</p></div></div>
          </article>
          <article className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-5">
            <div className="flex items-start gap-3"><span className="rounded-xl bg-rose-300/10 p-3 text-rose-200"><ShieldAlert className="h-5 w-5" /></span><div><h2 className="font-bold text-white">Possible missed classes</h2><p className="mt-1 text-sm text-slate-400">Completed class sessions with no matching student attendance record.</p><p className="mt-3 text-3xl font-black text-rose-100 tabular-nums">{data.alerts.missedClassEnrolments}</p></div></div>
          </article>
        </section>

        <div className="flex flex-wrap gap-2">
          {(["overview", "teachers", "students"] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm font-bold capitalize transition ${tab === item ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>{item === "students" ? "Student reports" : item === "teachers" ? "Teacher performance" : "Overview"}</button>)}
        </div>

        {(tab === "overview" || tab === "teachers") && <section className={panel}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-white">Teacher performance</h2><p className={`mt-1 text-sm ${muted}`}>Scheduled sessions, completed sessions, student attendance and average attended minutes.</p></div><span className="text-xs font-semibold text-slate-500">Based on classroom records</span></div>
          <div className="space-y-4">{data.teachers.map((teacher) => {
            const completion = teacher.total_classes ? Math.round(teacher.completed_classes / teacher.total_classes * 100) : 0;
            return <article key={teacher.id} className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-white">{teacher.teacher_name}</p><p className="mt-1 text-xs text-slate-400">{teacher.total_classes} sessions · {teacher.student_attendances} student attendances · {teacher.avg_student_minutes} avg. minutes</p></div><span className="text-lg font-black text-cyan-100 tabular-nums">{completion}%</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${completion}%` }} /></div>
              <p className="mt-2 text-xs text-slate-500">{teacher.completed_classes} completed · {teacher.active_classes} currently active</p>
            </article>;
          })}{data.teachers.length === 0 && <p className={`text-sm ${muted}`}>No teacher activity is recorded yet.</p>}</div>
        </section>}

        {(tab === "overview" || tab === "students") && <section className={panel}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-white">Student progress reports</h2><p className={`mt-1 text-sm ${muted}`}>Progress by student and enrolled course. Export the filtered report as CSV.</p></div><button type="button" onClick={() => downloadCsv(students)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"><Download className="h-4 w-4" /> Export CSV</button></div>
          <div className="mb-4 flex flex-wrap gap-3">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><Search className="h-4 w-4 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, email or course…" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></label>
            <button type="button" onClick={() => setShowAtRisk((value) => !value)} aria-pressed={showAtRisk} className={`rounded-xl border px-3 py-2 text-xs font-bold ${showAtRisk ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-300"}`}>{showAtRisk ? "Showing at-risk only" : "Show at-risk only"}</button>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Student</th><th className="px-3 py-3">Course</th><th className="px-3 py-3">Progress</th><th className="px-3 py-3">Classes attended</th><th className="px-3 py-3">Last attendance</th></tr></thead><tbody>{students.map((student) => {
            const progress = Math.max(0, Math.min(100, Number(student.progress_percentage) || 0));
            return <tr key={`${student.student_id}-${student.course_id}`} className="border-b border-white/5 last:border-0"><td className="px-3 py-3"><p className="font-semibold text-white">{student.student_name}</p><p className="text-xs text-slate-500">{student.email}</p></td><td className="px-3 py-3 text-slate-300">{student.course_title}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${progress}%` }} /></div><span className="text-xs font-bold text-white tabular-nums">{progress}%</span></div></td><td className="px-3 py-3 text-slate-300 tabular-nums">{student.classes_attended}</td><td className="px-3 py-3 text-xs text-slate-400">{dateLabel(student.last_class_attended)}</td></tr>;
          })}</tbody></table></div>
          {students.length === 0 && <p className={`py-8 text-center text-sm ${muted}`}>No matching student progress records.</p>}
          <p className="mt-3 text-xs text-slate-500">Showing up to 100 enrolment records. Progress values come from the platform's saved enrolment progress.</p>
        </section>}
      </>}
    </div>
  </AdminShell>;
}
