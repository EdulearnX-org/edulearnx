import { useCourses } from "@/hooks/useCourses";
import { useEnrollmentRequests } from "@/hooks/useEnrollmentRequests";
import { usePortalStats } from "@/hooks/usePortalStats";
import { useTutorApplications } from "@/hooks/useTutorApplications";
import { useUsers } from "@/hooks/useUsers";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  ListChecks,
  Users,
} from "lucide-react";
import AdminShell from "./AdminShell";

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{value}</p>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">{detail}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
          {icon}
        </span>
      </div>
    </section>
  );
}

export default function AdminOverview() {
  const stats = usePortalStats();
  const { users } = useUsers();
  const { courses } = useCourses();
  const { requests } = useEnrollmentRequests();
  const { applications } = useTutorApplications();

  const teachers = users.filter((user) => user.role === "teacher");
  const students = users.filter((user) => user.role === "student");
  const activeCourses = courses.filter((course) => course.is_published);
  const pendingEnrollmentRequests = requests.filter(
    (request) => request.status === "pending",
  );
  const pendingTutorApplications = applications.filter(
    (application) => application.status === "pending",
  );
  return (
    <AdminShell
      title="Dashboard"
      subtitle="Overview of students, teachers, courses, approvals, and portal activity."
    >
      <div className="space-y-6">
        <header>
          <p className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Admin Portal
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-700 dark:text-slate-300">
            Monitor users, course catalog status, enrollment requests, and tutor
            approvals from one place.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Students"
            value={stats.totalStudents || students.length}
            detail="Registered learner accounts"
            icon={<Users className="h-5 w-5" />}
          />
          <SummaryCard
            label="Teachers"
            value={stats.totalTeachers || teachers.length}
            detail="Approved teaching accounts"
            icon={<GraduationCap className="h-5 w-5" />}
          />
          <SummaryCard
            label="Courses"
            value={stats.totalCourses || courses.length}
            detail={`${activeCourses.length} published courses`}
            icon={<BookOpen className="h-5 w-5" />}
          />
          <SummaryCard
            label="Pending"
            value={stats.pendingEnrollmentRequests || pendingEnrollmentRequests.length}
            detail="Enrollment requests to review"
            icon={<Clock className="h-5 w-5" />}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <ListChecks className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950 dark:text-white">Review Queue</h2>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Items that need admin attention.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Enrollment requests
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
                  {pendingEnrollmentRequests.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Tutor applications
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
                  {pendingTutorApplications.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950 dark:text-white">Course Details</h2>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Current course catalog status.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {courses.slice(0, 4).map((course) => (
                <div
                  key={course.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-950"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">
                      {course.title}
                    </p>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {course.instructor_name || "No teacher assigned"}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                    {course.enrollment_count} enrolled
                  </span>
                </div>
              ))}
              {courses.length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-slate-100 p-3 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  No courses found.
                </p>
              )}
            </div>
          </div>
        </section>

        {stats.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {stats.error}
          </p>
        )}
      </div>
    </AdminShell>
  );
}
