import Navbar from "@/components/Navbar";
import { DatabaseCourse, courseDateRange, courseDuration } from "@/hooks/useCourses";
import { useStudentEnrollments } from "@/hooks/useStudentEnrollments";
import { getCurrentPortalUser } from "@/lib/portalData";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

export default function CourseDetail() {
  const { id } = useParams();
  const [course, setCourse] = useState<DatabaseCourse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const currentUser = getCurrentPortalUser();
  const studentId = currentUser?.role === "student" ? currentUser.id : undefined;
  const { enrollments } = useStudentEnrollments(studentId);

  useEffect(() => {
    let isMounted = true;

    const loadCourse = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/courses/${id}`);
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to fetch course details.");
        }

        if (isMounted) {
          setCourse(payload.data);
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setCourse(null);
          setError(
            err instanceof Error ? err.message : "Unable to fetch course details.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCourse();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 pb-20 pt-32 text-center sm:px-6 lg:px-8">
          <BookOpen className="mx-auto mb-5 h-14 w-14 text-edu-purple" />
          <p className="text-lg font-semibold text-slate-600">
            Loading course from database...
          </p>
        </main>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 pb-20 pt-32 text-center sm:px-6 lg:px-8">
          <BookOpen className="mx-auto mb-5 h-14 w-14 text-edu-purple" />
          <h1 className="text-4xl font-bold text-slate-900">
            Course not found
          </h1>
          <p className="mt-4 text-slate-600">
            {error || "The course you selected is not available."}
          </p>
          <Link
            to="/courses"
            className="btn-primary mt-8 inline-flex items-center gap-2"
          >
            <ArrowLeft size={18} /> Back to Courses
          </Link>
        </main>
      </div>
    );
  }

  const hasAccess = enrollments.some(
    (enrollment) => enrollment.course_id === course.id,
  );
  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar />

      <section className="relative px-4 pb-16 pt-32 sm:px-6 lg:px-8">
        <div className="absolute top-20 -left-40 h-80 w-80 rounded-full bg-edu-purple/20 glow-blob"></div>
        <div
          className="absolute top-40 -right-40 h-80 w-80 rounded-full bg-edu-light-blue/20 glow-blob"
          style={{ animationDelay: "2s" }}
        ></div>

        <div className="relative z-10 mx-auto max-w-7xl">
          <Link
            to="/courses"
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-edu-dark-blue hover:text-edu-purple"
          >
            <ArrowLeft size={16} /> Courses
          </Link>

          <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              {course.category && (
                <div className="mb-4 inline-flex rounded-full bg-edu-purple/10 px-4 py-2 text-sm font-semibold text-edu-purple">
                  {course.category}
                </div>
              )}
              <h1 className="text-5xl font-bold leading-tight text-slate-900 sm:text-6xl">
                {course.title}
              </h1>
              {course.description && (
                <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-600">
                  {course.description}
                </p>
              )}

              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Teacher",
                    value: course.instructor_name || "Not assigned",
                    icon: <Layers className="h-5 w-5" />,
                  },
                  {
                    label: "Duration",
                    value: courseDuration(course),
                    icon: <CalendarDays className="h-5 w-5" />,
                  },
                  {
                    label: "Course dates",
                    value: courseDateRange(course),
                    icon: <Clock className="h-5 w-5" />,
                  },
                  {
                    label: "Price",
                    value: `$${(course.price_cents / 100).toFixed(2)}`,
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-edu-purple/10 text-edu-purple">
                      {item.icon}
                    </div>
                    <p className="text-sm font-semibold text-slate-500">
                      {item.label}
                    </p>
                    <p className="mt-1 font-bold text-slate-900">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="course-card overflow-hidden">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt={`${course.title} course`}
                  className="h-80 w-full object-cover"
                />
              ) : (
                <div className="flex h-80 items-center justify-center bg-slate-100 text-slate-400">
                  <BookOpen className="h-16 w-16" />
                </div>
              )}
              <div className="p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-500 text-white">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Instructor</p>
                    <p className="font-bold text-slate-900">
                      {course.instructor_name || "Not assigned"}
                    </p>
                  </div>
                </div>

                {hasAccess ? (
                  <Link
                    to="/student/courses"
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <CheckCircle2 size={16} /> Open Course
                  </Link>
                ) : (
                  <Link
                    to={`/checkout/${course.id}`}
                    className="btn-primary flex w-full items-center justify-center gap-2 py-3"
                  >
                    Enroll Now - ${((course.price_cents) / 100).toFixed(2)} <ArrowRight size={16} />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
            <GraduationCap className="mb-4 h-10 w-10 text-edu-purple" />
            <h2 className="text-3xl font-bold text-slate-900">
              Course Details
            </h2>
            <p className="mt-4 leading-relaxed text-slate-600">
              This page displays only the course information currently stored in
              the database.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-3xl font-bold text-slate-900">
              Database Fields
            </h2>
            <div className="mt-6 grid gap-4 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <span className="font-semibold text-slate-500">Course ID</span>
                <span className="text-right text-slate-900">{course.id}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <span className="font-semibold text-slate-500">Published</span>
                <span className="text-right text-slate-900">
                  {course.is_published ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-slate-500">Created</span>
                <span className="text-right text-slate-900">
                  {new Date(course.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
