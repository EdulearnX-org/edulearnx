import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourses } from "@/hooks/useCourses";
import { useEnrollmentRequests } from "@/hooks/useEnrollmentRequests";
import { usePortalStats } from "@/hooks/usePortalStats";
import { useTutorApplications } from "@/hooks/useTutorApplications";
import { useUsers } from "@/hooks/useUsers";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import AdminShell from "./AdminShell";

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  tone?: "blue" | "violet" | "emerald" | "amber";
}) {
  const tones = {
    blue: "border-sky-300/25 from-sky-500/20 to-cyan-500/5 text-sky-200",
    violet: "border-violet-300/25 from-violet-500/20 to-fuchsia-500/5 text-violet-200",
    emerald: "border-emerald-300/25 from-emerald-500/20 to-teal-500/5 text-emerald-200",
    amber: "border-amber-300/25 from-amber-500/20 to-orange-500/5 text-amber-200",
  };
  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-lg shadow-slate-950/10 backdrop-blur-xl ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-300">{label}</p>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-white tabular-nums">{value}</p>
          <p className="mt-2 text-xs font-medium text-slate-400">{detail}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-slate-950/35">{icon}</span>
      </div>
    </article>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/15 bg-slate-950/45 p-5 shadow-xl shadow-slate-950/10 backdrop-blur-xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminOverview() {
  const stats = usePortalStats();
  const { users, isLoading: usersLoading, error: usersError } = useUsers();
  const { courses, isLoading: coursesLoading, error: coursesError } = useCourses();
  const { requests, isLoading: requestsLoading, error: requestsError } = useEnrollmentRequests();
  const { applications, isLoading: applicationsLoading, error: applicationsError } = useTutorApplications();
  const [courseSearch, setCourseSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const teachers = users.filter((user) => user.role === "teacher");
  const students = users.filter((user) => user.role === "student");
  const activeUsers = users.filter((user) => user.is_active);
  const inactiveUsers = users.filter((user) => !user.is_active);
  const activeCourses = courses.filter((course) => course.is_published);
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const pendingApplications = applications.filter((application) => application.status === "pending");
  const recentUsers = useMemo(
    () => [...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6),
    [users],
  );
  const filteredCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase();
    return [...courses]
      .filter((course) => !query || course.title.toLowerCase().includes(query) || (course.instructor_name || "").toLowerCase().includes(query))
      .sort((a, b) => b.enrollment_count - a.enrollment_count)
      .slice(0, 5);
  }, [courses, courseSearch]);
  const maxEnrollments = Math.max(1, ...filteredCourses.map((course) => course.enrollment_count));
  const loading = stats.isLoading || usersLoading || coursesLoading || requestsLoading || applicationsLoading;
  const errors = [stats.error, usersError, coursesError, requestsError, applicationsError].filter(Boolean);

  const refreshDashboard = () => {
    setRefreshing(true);
    window.dispatchEvent(new Event("edulearnx-data-change"));
    window.setTimeout(() => setRefreshing(false), 900);
  };

  return (
    <AdminShell title="Admin command centre" subtitle="A live operational overview of your EduLearnX platform.">
      <div className="space-y-6">
        <header className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-slate-950/90 via-indigo-950/75 to-slate-950/85 p-6 shadow-2xl shadow-indigo-950/20 backdrop-blur-xl sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-1/3 h-52 w-52 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Admin command centre
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Platform overview</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Keep track of people, learning activity, course performance and the reviews that need your attention.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh data
            </button>
          </div>
          <div className="relative mt-7 flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">Users: {users.length}</span>
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">Published courses: {activeCourses.length}</span>
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">Pending reviews: {pendingRequests.length + pendingApplications.length}</span>
            {loading && <span className="rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-sky-200">Updating data…</span>}
          </div>
        </header>

        <section aria-label="Platform metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Students" value={stats.totalStudents || students.length} detail={`${students.length} student profiles loaded`} icon={<Users className="h-5 w-5" />} tone="blue" />
          <MetricCard label="Teachers" value={stats.totalTeachers || teachers.length} detail="Teaching accounts" icon={<GraduationCap className="h-5 w-5" />} tone="violet" />
          <MetricCard label="Course catalogue" value={stats.totalCourses || courses.length} detail={`${activeCourses.length} currently published`} icon={<BookOpen className="h-5 w-5" />} tone="emerald" />
          <MetricCard label="Enrollments" value={stats.totalEnrollments} detail="Recorded course enrollments" icon={<CheckCircle2 className="h-5 w-5" />} tone="amber" />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link to="/admin/enrollment-requests" className="group rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 transition hover:-translate-y-0.5 hover:bg-amber-300/[0.12]">
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-amber-100">Enrollment reviews</span><ArrowRight className="h-4 w-4 text-amber-200 transition group-hover:translate-x-1" /></div>
            <p className="mt-3 text-3xl font-extrabold text-white tabular-nums">{pendingRequests.length}</p>
            <p className="mt-1 text-xs text-slate-400">Payment and enrollment requests waiting</p>
          </Link>
          <Link to="/admin/tutor-applications" className="group rounded-2xl border border-violet-300/20 bg-violet-300/[0.07] p-4 transition hover:-translate-y-0.5 hover:bg-violet-300/[0.12]">
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-violet-100">Tutor applications</span><ArrowRight className="h-4 w-4 text-violet-200 transition group-hover:translate-x-1" /></div>
            <p className="mt-3 text-3xl font-extrabold text-white tabular-nums">{pendingApplications.length}</p>
            <p className="mt-1 text-xs text-slate-400">Applicants awaiting a decision</p>
          </Link>
          <Link to="/admin/students" className="group rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 transition hover:-translate-y-0.5 hover:bg-emerald-300/[0.12]">
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-emerald-100">Active accounts</span><ArrowRight className="h-4 w-4 text-emerald-200 transition group-hover:translate-x-1" /></div>
            <p className="mt-3 text-3xl font-extrabold text-white tabular-nums">{activeUsers.length}</p>
            <p className="mt-1 text-xs text-slate-400">{inactiveUsers.length} inactive accounts</p>
          </Link>
          <Link to="/admin/live-classes" className="group rounded-2xl border border-sky-300/20 bg-sky-300/[0.07] p-4 transition hover:-translate-y-0.5 hover:bg-sky-300/[0.12]">
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-sky-100">Class operations</span><ArrowRight className="h-4 w-4 text-sky-200 transition group-hover:translate-x-1" /></div>
            <p className="mt-3 flex items-center gap-2 text-xl font-extrabold text-white"><CalendarClock className="h-5 w-5" /> Live classes</p>
            <p className="mt-1 text-xs text-slate-400">Open classroom administration</p>
          </Link>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel
            title="Course performance"
            description="Top courses by recorded enrollment count."
            action={<Link to="/admin/courses" className="inline-flex items-center gap-1 text-xs font-bold text-cyan-200 hover:text-white">Manage courses <ArrowRight className="h-3.5 w-3.5" /></Link>}
          >
            <label className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} placeholder="Search course or instructor…" className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
            </label>
            <div className="space-y-4">
              {filteredCourses.map((course) => (
                <div key={course.id}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{course.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{course.instructor_name || "No teacher assigned"} · {course.is_published ? "Published" : "Unpublished"}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-slate-200">{course.enrollment_count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all" style={{ width: `${Math.max(2, (course.enrollment_count / maxEnrollments) * 100)}%` }} />
                  </div>
                </div>
              ))}
              {filteredCourses.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-slate-400">No matching courses found.</p>}
            </div>
          </Panel>

          <Panel title="Account health" description="Current account status from the user directory.">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4">
                <UserCheck className="h-5 w-5 text-emerald-200" />
                <p className="mt-3 text-2xl font-extrabold text-white tabular-nums">{activeUsers.length}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">Active accounts</p>
              </div>
              <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.06] p-4">
                <UserX className="h-5 w-5 text-rose-200" />
                <p className="mt-3 text-2xl font-extrabold text-white tabular-nums">{inactiveUsers.length}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">Inactive accounts</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Students</span><span className="font-bold text-white">{students.length}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Teachers</span><span className="font-bold text-white">{teachers.length}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Administrators</span><span className="font-bold text-white">{users.filter((user) => user.role === "admin").length}</span></div>
            </div>
            <Link to="/admin/students" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-cyan-200 hover:text-white">Open user management <ArrowRight className="h-4 w-4" /></Link>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel title="Recently registered" description="The latest accounts returned by the user directory." action={<Link to="/admin/students" className="text-xs font-bold text-cyan-200 hover:text-white">View directory</Link>}>
            <div className="space-y-3">
              {recentUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400/25 to-violet-400/25 text-sm font-extrabold text-white">{(user.full_name || user.email).slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{user.full_name || "Unnamed account"}</p>
                    <p className="truncate text-xs text-slate-400">{user.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">{user.role}</span>
                    <p className="mt-1 text-[11px] text-slate-500">{formatDate(user.created_at)}</p>
                  </div>
                </div>
              ))}
              {recentUsers.length === 0 && <p className="text-sm text-slate-400">No user records available.</p>}
            </div>
          </Panel>

          <Panel title="Admin attention" description="Prioritised links to pending work and operational areas.">
            <div className="space-y-3">
              <Link to="/admin/enrollment-requests" className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-3 transition hover:bg-white/[0.07]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><Clock3 className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">Review enrollment requests</span><span className="block text-xs text-slate-400">Verify submitted payment and enrollment details</span></span>
                <span className="text-lg font-extrabold text-white tabular-nums">{pendingRequests.length}</span>
              </Link>
              <Link to="/admin/tutor-applications" className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-3 transition hover:bg-white/[0.07]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/10 text-violet-200"><ShieldCheck className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">Review tutor applications</span><span className="block text-xs text-slate-400">Assess applicants and teaching credentials</span></span>
                <span className="text-lg font-extrabold text-white tabular-nums">{pendingApplications.length}</span>
              </Link>
              <Link to="/admin/live-classes" className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-3 transition hover:bg-white/[0.07]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-300/10 text-sky-200"><Activity className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">Monitor live classes</span><span className="block text-xs text-slate-400">Open scheduled and ongoing class operations</span></span>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </Link>
            </div>
          </Panel>
        </section>

        {errors.length > 0 && (
          <div role="status" className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm text-amber-100">
            <p className="font-bold">Some dashboard data could not be loaded.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100/80">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
          </div>
        )}
        {!loading && errors.length === 0 && (
          <p className="flex items-center gap-2 text-xs font-medium text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> Dashboard data loaded from EduLearnX services. Some analytics, such as financial totals and visitor trends, are not yet exposed by the current API.</p>
        )}
      </div>
    </AdminShell>
  );
}
