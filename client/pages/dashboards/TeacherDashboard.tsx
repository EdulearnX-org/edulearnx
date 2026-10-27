import DashboardLayout from "@/components/DashboardLayout";
import { courseDateRange, courseDuration, useCourses } from "@/hooks/useCourses";
import {
  buildFiveWeekdayClassTimes,
  localLiveClassWindowLabel,
  localTimeZoneLabel,
  useLiveClasses,
} from "@/hooks/useLiveClasses";
import { getCurrentPortalUser } from "@/lib/portalData";
import { BookOpen, CalendarClock, LayoutDashboard, Video } from "lucide-react";
import { FormEvent, useState } from "react";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-white";

export default function TeacherDashboard() {
  const currentUser = getCurrentPortalUser();
  const { courses, isLoading, error } = useCourses();
  const {
    liveClasses,
    isLoading: liveLoading,
    error: liveError,
    reload: reloadLiveClasses,
  } = useLiveClasses({ teacherId: currentUser?.id });
  const [form, setForm] = useState({
    course_id: "",
    title: "",
    class_time: "",
    duration_minutes: "60",
  });
  const [status, setStatus] = useState("");
  const assignedCourses = courses.filter(
    (course) => String(course.instructor_id) === String(currentUser?.id),
  );

  const navItems = [
    {
      label: "Dashboard",
      icon: <LayoutDashboard size={18} />,
      href: "/teacher",
    },
  ];

  const assignTiming = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");

    if (!currentUser?.id) {
      setStatus("Teacher account not found.");
      return;
    }

    const durationMinutes = Number(form.duration_minutes);
    const sessions = buildFiveWeekdayClassTimes(form.class_time, durationMinutes);

    if (!form.course_id || sessions.length !== 5 || durationMinutes < 15) {
      setStatus("Choose a course, time, and duration of at least 15 minutes.");
      return;
    }

    for (const session of sessions) {
      const response = await fetch("/api/live-classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: form.course_id,
          teacher_id: currentUser.id,
          title: form.title,
          description: "",
          scheduled_start: session.scheduled_start,
          scheduled_end: session.scheduled_end,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setStatus(payload.error || "Unable to assign timing.");
        return;
      }
    }

    setForm({
      course_id: "",
      title: "",
      class_time: "",
      duration_minutes: "60",
    });
    setStatus(`Timing assigned in your timezone (${localTimeZoneLabel()}).`);
    await reloadLiveClasses();
    window.dispatchEvent(new Event("edulearnx-data-change"));
  };

  return (
    <DashboardLayout
      title="Teacher Dashboard"
      subtitle="Assign timings for your courses."
      navItems={navItems}
      userRole="Teacher"
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">
            Teacher Dashboard
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Assign course timings and review your scheduled live classes.
          </p>
        </header>

        {status && (
          <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            {status}
          </p>
        )}

        <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">
                Assign timing
              </h2>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                One time creates five weekday classes, Monday through Friday.
              </p>
            </div>
          </div>

          <form onSubmit={assignTiming} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              required
              value={form.course_id}
              onChange={(event) =>
                setForm({ ...form, course_id: event.target.value })
              }
              className={inputClass}
            >
              <option value="">Select assigned course</option>
              {assignedCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <input
              required
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              placeholder="Class title"
              className={inputClass}
            />
            <input
              required
              type="time"
              value={form.class_time}
              onChange={(event) =>
                setForm({ ...form, class_time: event.target.value })
              }
              className={inputClass}
              aria-label="Class time"
            />
            <input
              required
              type="number"
              min="15"
              step="15"
              value={form.duration_minutes}
              onChange={(event) =>
                setForm({ ...form, duration_minutes: event.target.value })
              }
              placeholder="Duration minutes"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={assignedCourses.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2 xl:col-span-4 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <Video className="h-4 w-4" /> Assign Monday-Friday Timing
            </button>
          </form>

          {assignedCourses.length === 0 && (
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
              No courses are assigned to your teacher account yet.
            </p>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold text-slate-950 dark:text-white">
              Assigned courses
            </h2>
            <div className="mt-4 space-y-3">
              {isLoading ? (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Loading courses...
                </p>
              ) : error ? (
                <p className="text-sm font-bold text-red-700 dark:text-red-300">
                  {error}
                </p>
              ) : assignedCourses.length === 0 ? (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No assigned courses.
                </p>
              ) : (
                assignedCourses.map((course) => (
                  <div
                    key={course.id}
                    className="rounded-lg border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                      <BookOpen className="h-4 w-4" />
                      {course.title}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {courseDuration(course)} | {courseDateRange(course)}
                    </p>
                    <p className="mt-2 font-mono text-xs font-bold tracking-wide text-blue-700 dark:text-blue-300">
                      Meeting ID: {course.meeting_id || "Preparing meeting..."}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold text-slate-950 dark:text-white">
              Assigned timings
            </h2>
            <div className="mt-4 space-y-3">
              {liveLoading ? (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Loading timings...
                </p>
              ) : liveError ? (
                <p className="text-sm font-bold text-red-700 dark:text-red-300">
                  {liveError}
                </p>
              ) : liveClasses.length === 0 ? (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No timings assigned yet.
                </p>
              ) : (
                liveClasses.map((liveClass) => (
                  <div
                    key={liveClass.id}
                    className="rounded-lg border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <p className="text-sm font-bold text-slate-950 dark:text-white">
                      {liveClass.title}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {liveClass.course_title} | {localLiveClassWindowLabel(liveClass)}
                    </p>
                    <a href={`/live-class/${liveClass.id}`} className="mt-3 inline-flex text-xs font-bold text-blue-700 hover:underline dark:text-blue-300">
                      Start course meeting
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
