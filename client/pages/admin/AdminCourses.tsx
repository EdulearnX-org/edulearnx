import { courseDateRange, courseDuration, DatabaseCourse, useCourses } from "@/hooks/useCourses";
import { readApiResponse } from "@/lib/api";
import { BookOpen, Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import AdminShell from "./AdminShell";

type CourseForm = {
  title: string;
  description: string;
  instructor_id: string;
  category: string;
  duration_weeks: string;
  start_date: string;
  end_date: string;
  thumbnail_url: string;
};

const emptyCourseForm: CourseForm = {
  title: "",
  description: "",
  instructor_id: "",
  category: "",
  duration_weeks: "",
  start_date: "",
  end_date: "",
  thumbnail_url: "",
};

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-white";

export default function AdminCourses() {
  const { courses, isLoading, error } = useCourses();
  const [teachers, setTeachers] = useState<Array<{ id: number | string; full_name: string }>>([]);
  const [teachersError, setTeachersError] = useState("");
  const [courseForm, setCourseForm] = useState<CourseForm>(emptyCourseForm);
  const [editing, setEditing] = useState<Record<string, Partial<DatabaseCourse>>>(
    {},
  );
  const [status, setStatus] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadTeachers = async () => {
      try {
        const response = await fetch("/api/instructors");
        const payload = await readApiResponse(response);
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to load instructors.");
        }
        if (isMounted) {
          setTeachers(payload.data || []);
          setTeachersError("");
        }
      } catch (error) {
        if (isMounted) setTeachersError(error instanceof Error ? error.message : "Unable to load instructors.");
      }
    };
    void loadTeachers();
    window.addEventListener("edulearnx-data-change", loadTeachers);
    return () => {
      isMounted = false;
      window.removeEventListener("edulearnx-data-change", loadTeachers);
    };
  }, []);

  const createCourse = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    const response = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: courseForm.title,
        description: courseForm.description,
        instructor_id: courseForm.instructor_id || null,
        category: courseForm.category,
        duration_weeks: courseForm.duration_weeks
          ? Number(courseForm.duration_weeks)
          : null,
        start_date: courseForm.start_date || null,
        end_date: courseForm.end_date || null,
        thumbnail_url: courseForm.thumbnail_url,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setStatus(payload.error || "Unable to create course.");
      return;
    }
    setCourseForm(emptyCourseForm);
    setStatus("Course created.");
    window.dispatchEvent(new Event("edulearnx-data-change"));
  };

  const saveCourse = async (course: DatabaseCourse) => {
    const draft = editing[String(course.id)] || {};
    const response = await fetch(`/api/courses/${course.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        duration_weeks: draft.duration_weeks
          ? Number(draft.duration_weeks)
          : draft.duration_weeks,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setStatus(payload.error || "Unable to save course.");
      return;
    }
    setEditing((current) => ({ ...current, [String(course.id)]: {} }));
    setStatus("Course saved.");
    window.dispatchEvent(new Event("edulearnx-data-change"));
  };

  const deleteCourse = async (course: DatabaseCourse) => {
    if (!window.confirm(`Delete ${course.title}?`)) {
      return;
    }
    const response = await fetch(`/api/courses/${course.id}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setStatus(payload.error || "Unable to delete course.");
      return;
    }
    setStatus("Course deleted.");
    window.dispatchEvent(new Event("edulearnx-data-change"));
  };

  return (
    <AdminShell title="Courses" subtitle="Manage courses.">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">
            Courses
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Create courses, edit details, assign teachers, publish, and delete courses.
          </p>
        </header>

        {status && (
          <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            {status}
          </p>
        )}
        {teachersError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{teachersError}</p>}

        <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-950 dark:text-white">
            Create course
          </h2>
          <form onSubmit={createCourse} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input required value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} placeholder="Course title" className={inputClass} />
            <select value={courseForm.instructor_id} onChange={(e) => setCourseForm({ ...courseForm, instructor_id: e.target.value })} className={inputClass}>
              <option value="">No teacher yet</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
              ))}
            </select>
            <input value={courseForm.category} onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })} placeholder="Category" className={inputClass} />
            <input type="number" min="1" value={courseForm.duration_weeks} onChange={(e) => setCourseForm({ ...courseForm, duration_weeks: e.target.value })} placeholder="Duration weeks" className={inputClass} />
            <input type="date" value={courseForm.start_date} onChange={(e) => setCourseForm({ ...courseForm, start_date: e.target.value })} className={inputClass} aria-label="Start date" />
            <input type="date" value={courseForm.end_date} onChange={(e) => setCourseForm({ ...courseForm, end_date: e.target.value })} className={inputClass} aria-label="End date" />
            <input value={courseForm.thumbnail_url} onChange={(e) => setCourseForm({ ...courseForm, thumbnail_url: e.target.value })} placeholder="Thumbnail URL" className={inputClass} />
            <input value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} placeholder="Description" className={`${inputClass} xl:col-span-2`} />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 md:col-span-2 xl:col-span-3 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              <Plus className="h-4 w-4" /> Create Course
            </button>
          </form>
        </section>

        <section className="space-y-3">
          {isLoading ? (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Loading courses...
            </p>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : courses.length === 0 ? (
            <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              No courses found.
            </p>
          ) : (
            courses.map((course) => {
              const draft = editing[String(course.id)] || {};

              return (
                <article
                  key={course.id}
                  className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white">
                        <BookOpen className="h-5 w-5" />
                        {course.title}
                      </h2>
                      <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {course.instructor_name || "No teacher"} | {courseDuration(course)} | {courseDateRange(course)}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                      {course.enrollment_count} enrolled
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <input value={String(draft.title ?? course.title)} onChange={(e) => setEditing((current) => ({ ...current, [String(course.id)]: { ...draft, title: e.target.value } }))} className={inputClass} />
                    <select value={String(draft.instructor_id ?? course.instructor_id ?? "")} onChange={(e) => setEditing((current) => ({ ...current, [String(course.id)]: { ...draft, instructor_id: e.target.value || null } }))} className={inputClass}>
                      <option value="">Unassigned</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
                      ))}
                    </select>
                    <input value={String(draft.category ?? course.category ?? "")} onChange={(e) => setEditing((current) => ({ ...current, [String(course.id)]: { ...draft, category: e.target.value } }))} placeholder="Category" className={inputClass} />
                    <input type="number" min="1" value={String(draft.duration_weeks ?? course.duration_weeks ?? "")} onChange={(e) => setEditing((current) => ({ ...current, [String(course.id)]: { ...draft, duration_weeks: Number(e.target.value) || null } }))} placeholder="Duration weeks" className={inputClass} />
                    <input type="date" value={String(draft.start_date ?? course.start_date ?? "").slice(0, 10)} onChange={(e) => setEditing((current) => ({ ...current, [String(course.id)]: { ...draft, start_date: e.target.value || null } }))} className={inputClass} aria-label="Start date" />
                    <input type="date" value={String(draft.end_date ?? course.end_date ?? "").slice(0, 10)} onChange={(e) => setEditing((current) => ({ ...current, [String(course.id)]: { ...draft, end_date: e.target.value || null } }))} className={inputClass} aria-label="End date" />
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <input type="checkbox" checked={Boolean(draft.is_published ?? course.is_published)} onChange={(e) => setEditing((current) => ({ ...current, [String(course.id)]: { ...draft, is_published: e.target.checked } }))} />
                      Published
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => saveCourse(course)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Save</button>
                    <button onClick={() => deleteCourse(course)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"><Trash2 className="h-4 w-4" /> Delete</button>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </AdminShell>
  );
}
