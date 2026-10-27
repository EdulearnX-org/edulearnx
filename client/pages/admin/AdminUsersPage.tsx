import { DatabaseUser, useUsers } from "@/hooks/useUsers";
import { useCourses } from "@/hooks/useCourses";
import {
  buildFiveWeekdayClassTimes,
  localLiveClassWindowLabel,
  localTimeZoneLabel,
  useLiveClasses,
} from "@/hooks/useLiveClasses";
import { requestPasswordReset } from "@/lib/portalData";
import { CalendarClock, KeyRound, Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import AdminShell from "./AdminShell";

type AdminUsersPageProps = {
  role: "student" | "teacher";
};

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-white";

function TeacherTimingManager({ teacher }: { teacher: DatabaseUser }) {
  const { courses } = useCourses();
  const {
    liveClasses,
    isLoading,
    error,
    reload: reloadLiveClasses,
  } = useLiveClasses({ teacherId: teacher.id });
  const assignedCourses = courses.filter(
    (course) => String(course.instructor_id) === String(teacher.id),
  );
  const [form, setForm] = useState({
    course_id: "",
    title: "",
    class_time: "",
    duration_minutes: "60",
  });
  const [status, setStatus] = useState("");

  const scheduleTiming = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");

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
          teacher_id: teacher.id,
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
    <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-slate-800 dark:text-slate-100" />
        <h3 className="font-semibold text-slate-950 dark:text-white">
          Assign timing
        </h3>
      </div>

      <form onSubmit={scheduleTiming} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          onChange={(event) => setForm({ ...form, title: event.target.value })}
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
          <CalendarClock className="h-4 w-4" /> Assign Monday-Friday Timing
        </button>
      </form>

      {assignedCourses.length === 0 && (
        <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
          Assign this teacher to a course first from the Courses page.
        </p>
      )}
      {status && (
        <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
          {status}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm font-bold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Loading assigned timings...
          </p>
        ) : liveClasses.length === 0 ? (
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No timings assigned yet.
          </p>
        ) : (
          liveClasses.slice(0, 5).map((liveClass) => (
            <div
              key={liveClass.id}
              className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-sm font-bold text-slate-950 dark:text-white">
                {liveClass.title}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                {liveClass.course_title} | {localLiveClassWindowLabel(liveClass)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function AdminUsersPage({ role }: AdminUsersPageProps) {
  const { users, isLoading, error } = useUsers();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
  });
  const [editing, setEditing] = useState<Record<number, Partial<DatabaseUser>>>(
    {},
  );
  const [status, setStatus] = useState("");
  const records = useMemo(
    () => users.filter((user) => user.role === role),
    [role, users],
  );
  const label = role === "student" ? "Students" : "Teachers";

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setStatus(payload.error || `Unable to create ${role}.`);
      return;
    }
    setForm({ full_name: "", email: "", phone: "" });
    setStatus(`${role === "student" ? "Student" : "Teacher"} profile created. Send a password reset email so they can set their password.`);
    window.dispatchEvent(new Event("edulearnx-data-change"));
  };

  const saveUser = async (user: DatabaseUser) => {
    const updates = editing[user.id] || {};
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setStatus(payload.error || "Unable to save user.");
      return;
    }
    setEditing((current) => ({ ...current, [user.id]: {} }));
    setStatus("User saved.");
    window.dispatchEvent(new Event("edulearnx-data-change"));
  };

  const sendPasswordReset = async (user: DatabaseUser) => {
    try {
      const payload = await requestPasswordReset(user.email);
      setStatus(payload.message || "If an active account exists, a password reset email has been sent.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to send password reset email.",
      );
    }
  };

  const deleteUser = async (user: DatabaseUser) => {
    if (!window.confirm(`Delete ${user.full_name}?`)) {
      return;
    }
    const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setStatus(payload.error || "Unable to delete user.");
      return;
    }
    setStatus("User deleted.");
    window.dispatchEvent(new Event("edulearnx-data-change"));
  };

  return (
    <AdminShell title={label} subtitle={`Manage ${label.toLowerCase()}.`}>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">
            {label}
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Create, edit, send password-reset emails, activate, and remove {label.toLowerCase()}.
          </p>
        </header>

        {status && (
          <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            {status}
          </p>
        )}

        <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-950 dark:text-white">
            Create {role}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            The person must sign up with this email and verify it before accessing this {role} profile.
          </p>
          <form onSubmit={createUser} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Full name" className={inputClass} />
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={inputClass} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className={inputClass} />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 md:col-span-2 xl:col-span-4 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              <Plus className="h-4 w-4" /> Create {role}
            </button>
          </form>
        </section>

        <section className="space-y-3">
          {isLoading ? (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Loading {label.toLowerCase()}...
            </p>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : records.length === 0 ? (
            <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              No {label.toLowerCase()} found.
            </p>
          ) : (
            records.map((user) => {
              const draft = editing[user.id] || {};

              return (
                <article
                  key={user.id}
                  className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-950 dark:text-white">
                        {user.full_name}
                      </h2>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {user.email}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <input value={draft.full_name ?? user.full_name} onChange={(e) => setEditing((current) => ({ ...current, [user.id]: { ...draft, full_name: e.target.value } }))} className={inputClass} />
                    <input value={user.email} readOnly aria-label="Sign-in email" className={`${inputClass} cursor-not-allowed opacity-70`} />
                    <input value={draft.phone ?? user.phone ?? ""} onChange={(e) => setEditing((current) => ({ ...current, [user.id]: { ...draft, phone: e.target.value } }))} placeholder="Phone" className={inputClass} />
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <input type="checkbox" checked={draft.is_active ?? user.is_active} onChange={(e) => setEditing((current) => ({ ...current, [user.id]: { ...draft, is_active: e.target.checked } }))} />
                      Active
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => saveUser(user)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Save</button>
                    <button onClick={() => deleteUser(user)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"><Trash2 className="h-4 w-4" /> Delete</button>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button onClick={() => void sendPasswordReset(user)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"><KeyRound className="h-4 w-4" /> Send Password Reset Email</button>
                  </div>

                  {role === "teacher" && <TeacherTimingManager teacher={user} />}
                </article>
              );
            })
          )}
        </section>
      </div>
    </AdminShell>
  );
}
