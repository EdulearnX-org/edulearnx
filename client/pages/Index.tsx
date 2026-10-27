import EduLearnXLogo from "@/components/EduLearnXLogo";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Reveal from "@/components/Reveal";
import { courseDateRange, courseDuration, useCourses } from "@/hooks/useCourses";
import { usePortalStats } from "@/hooks/usePortalStats";
import { useStudentEnrollments } from "@/hooks/useStudentEnrollments";
import { getCurrentPortalUser } from "@/lib/portalData";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Users,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Live Interactive Classes",
    description: "Real-time learning with instant feedback from instructors",
  },
  {
    icon: Users,
    title: "Expert Teachers",
    description: "Learn from industry professionals with years of experience",
  },
  {
    icon: Clock,
    title: "Flexible Timings",
    description: "Study at your own pace with recorded sessions available",
  },
];

export default function Index() {
  const portalStats = usePortalStats();
  const { courses, isLoading: coursesLoading, error: coursesError } = useCourses();
  const currentUser = getCurrentPortalUser();
  const studentId = currentUser?.role === "student" ? currentUser.id : undefined;
  const { enrollments } = useStudentEnrollments(studentId);
  const enrolledCourseIds = new Set(
    enrollments.map((enrollment) => enrollment.course_id),
  );
  const stats = [
    { number: portalStats.totalStudents, label: "Active Students" },
    { number: portalStats.totalCourses, label: "Courses" },
    { number: portalStats.totalEnrollments, label: "Enrollments" },
  ];
  const companyStats = [
    { label: "Students", value: portalStats.totalStudents },
    { label: "Courses", value: portalStats.totalCourses },
    { label: "Enrollments", value: portalStats.totalEnrollments },
    { label: "Pending", value: portalStats.pendingEnrollmentRequests },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7f8f5] dark:bg-slate-950">
      <Navbar />

      <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[.16em] text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Learn with momentum
              </p>

              <h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-[-.055em] text-slate-950 sm:text-7xl dark:text-white">
                Build skills that move you forward.
              </h1>

              <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                Live classes, practical projects, and teachers who make difficult ideas feel doable.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  to="/signup"
                  className="flex items-center justify-center gap-2 rounded-full bg-[#173d33] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-[#245848]"
                >
                  Explore courses <ArrowRight size={18} />
                </Link>
                <Link
                  to="/courses"
                  className="flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-[#173d33] transition hover:border-emerald-500"
                >
                  See how it works
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-6">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-3xl font-black text-slate-950 dark:text-white">
                      {stat.number}
                    </p>
                    <p className="text-sm text-slate-600 mt-1 dark:text-slate-400">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hidden min-h-[360px] overflow-hidden rounded-[2rem] bg-[#173d33] p-8 text-white shadow-2xl shadow-emerald-950/15 lg:flex">
              <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full border-[28px] border-emerald-300/20" />
              <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full border-[36px] border-amber-200/15" />
              <div className="relative flex min-h-[300px] flex-1 flex-col justify-between">
                <div className="flex items-center justify-between text-sm font-bold text-emerald-100"><span>Today's focus</span><span>01 / 03</span></div>
                <div>
                  <p className="text-sm font-semibold text-amber-200">COMMUNICATION</p>
                  <p className="mt-3 max-w-sm text-4xl font-black leading-tight tracking-[-.04em]">Speak clearly. Think boldly.</p>
                  <p className="mt-4 max-w-sm leading-7 text-emerald-100/80">A 20-minute practice to make your next conversation count.</p>
                </div>
                <Link to="/courses" className="flex w-fit items-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-bold text-[#173d33]">Start learning <ArrowRight size={17} /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="max-w-7xl mx-auto">
          <Reveal className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4 dark:text-slate-100">
              Courses
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto dark:text-slate-300">
              Choose from our wide range of expertly designed courses
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {coursesLoading && (
              <p className="col-span-full text-center text-slate-600 dark:text-slate-300">
                Loading courses from database...
              </p>
            )}

            {!coursesLoading && coursesError && (
              <p className="col-span-full rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm font-semibold text-red-700">
                {coursesError}
              </p>
            )}

            {!coursesLoading && !coursesError && courses.length === 0 && (
              <p className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                No courses are available in the database yet.
              </p>
            )}

            {courses.slice(0, 6).map((course, idx) => (
              <Reveal
                key={course.id}
                className="course-card group flex h-full flex-col"
                delay={idx * 90}
              >
                {course.thumbnail_url ? (
                  <div className="overflow-hidden">
                    <img
                      src={course.thumbnail_url}
                      alt={`${course.title} course`}
                      className="course-image group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <BookOpen className="h-12 w-12" />
                  </div>
                )}
                <div className="flex flex-grow flex-col p-8">
                  {course.category && (
                    <div className="mb-4 inline-flex w-fit rounded-full bg-edu-purple/10 px-3 py-1 text-xs font-semibold text-edu-purple">
                      {course.category}
                    </div>
                  )}
                  <h3 className="text-2xl font-bold text-slate-900 mb-2 dark:text-slate-100">
                    {course.title}
                  </h3>
                  <p className="text-slate-600 mb-6 flex-grow dark:text-slate-300">
                    {course.description}
                  </p>
                  <p className="mb-6 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {courseDuration(course)} | {courseDateRange(course)} | {course.enrollment_count} enrolled
                  </p>
                  <div className="space-y-3">
                    {enrolledCourseIds.has(course.id) ? (
                      <Link
                        to="/student/courses"
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 font-semibold text-white transition hover:bg-emerald-700"
                      >
                        <CheckCircle2 size={16} /> Open Course
                      </Link>
                    ) : (
                      <Link
                        to={`/checkout/${course.id}`}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                      >
                        Enroll Now <ArrowRight size={16} />
                      </Link>
                    )}
                    <Link
                      to={`/course/${course.id}`}
                      className="btn-outline-primary w-full flex items-center justify-center gap-2"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <Reveal className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4 dark:text-slate-100">
              Why Choose EduLearnX?
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto dark:text-slate-300">
              Premium features designed for your success
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {features.map((feature, idx) => (
              <Reveal
                key={feature.title}
                className="feature-card group"
                delay={idx * 80}
              >
                <div className="gradient-purple p-3 rounded-lg w-fit mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2 dark:text-slate-100">
                  {feature.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed dark:text-slate-300">
                  {feature.description}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-950">
        <div className="max-w-4xl mx-auto">
          <Reveal className="gradient-mixed p-12 rounded-3xl text-white text-center">
            <h2 className="text-4xl sm:text-5xl font-bold mb-6">
              Ready to Transform Your Learning?
            </h2>
            <p className="text-lg text-white/90 mb-10 leading-relaxed">
              Create a student account and start learning with EduLearnX today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/signup"
                className="px-8 py-3 rounded-full font-semibold bg-white text-edu-dark-blue hover:shadow-lg transition-all duration-300 hover:scale-105"
              >
                Get Started
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}
