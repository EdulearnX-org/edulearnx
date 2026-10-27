import DashboardLayout from "@/components/DashboardLayout";
import { courseDateRange, useCourses } from "@/hooks/useCourses";
import { useStudentEnrollments } from "@/hooks/useStudentEnrollments";
import { useStudentRewards } from "@/hooks/useStudentRewards";
import { localLiveClassWindowLabel, useLiveClasses } from "@/hooks/useLiveClasses";
import {
  getCurrentPortalUser,
  updateCurrentPortalUser,
} from "@/lib/portalData";
import {
  Award,
  BookOpen,
  CalendarDays,
  Coins,
  Flame,
  LayoutDashboard,
  Search,
  Save,
  Settings,
  Video,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

type StudentPage =
  | "dashboard"
  | "catalog"
  | "courses"
  | "help"
  | "settings";

type StudentDashboardProps = {
  page?: StudentPage;
};

const pageCopy: Record<StudentPage, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Student Dashboard",
    subtitle: "View your learning summary.",
  },
  courses: {
    title: "Enrolled Courses",
    subtitle: "Open and track your approved courses.",
  },
  catalog: {
    title: "Courses",
    subtitle: "Browse available courses inside your student portal.",
  },
  settings: {
    title: "Settings",
    subtitle: "Edit your account details.",
  },
  help: {
    title: "Student Dashboard",
    subtitle: "View your learning summary.",
  },
};

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-white";

export default function StudentDashboard({
  page = "dashboard",
}: StudentDashboardProps) {
  const currentUser = getCurrentPortalUser();
  const { courses, isLoading: coursesLoading, error: coursesError } = useCourses();
  const { enrollments, isLoading, error } = useStudentEnrollments(
    currentUser?.id,
  );
  const {
    rewards,
    isLoading: rewardsLoading,
    error: rewardsError,
  } = useStudentRewards(currentUser?.id);
  const { liveClasses, isLoading: liveClassesLoading } = useLiveClasses({
    studentId: currentUser?.id,
  });
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("all");
  const [profileName, setProfileName] = useState(currentUser?.name ?? "");
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone ?? "");
  const [profileStatus, setProfileStatus] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    let isMounted = true;

    fetch(`/api/users/${currentUser.id}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || "Unable to load profile.");
        }
        return payload.data;
      })
      .then((user) => {
        if (!isMounted) {
          return;
        }

        setProfileName(user.full_name ?? currentUser.name);
        setProfilePhone(user.phone ?? "");
        updateCurrentPortalUser({
          name: user.full_name ?? currentUser.name,
          phone: user.phone ?? "",
        });
      })
      .catch(() => {
        if (isMounted) {
          setProfileStatus("Unable to load profile.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser?.id) {
      return;
    }

    setIsSavingProfile(true);
    setProfileStatus("");

    try {
      const response = await fetch(`/api/users/${currentUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: profileName.trim(),
          phone: profilePhone.trim(),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Unable to save profile.");
      }

      updateCurrentPortalUser({
        name: payload.data.full_name,
        phone: payload.data.phone ?? "",
      });
      setProfileStatus("Profile saved.");
    } catch (err) {
      setProfileStatus(
        err instanceof Error ? err.message : "Unable to save profile.",
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const navItems = [
    { label: "Dashboard", icon: <LayoutDashboard size={18} />, href: "/student" },
    { label: "Courses", icon: <BookOpen size={18} />, href: "/student/catalog" },
    {
      label: "Enrolled Courses",
      icon: <BookOpen size={18} />,
      href: "/student/courses",
    },
    { label: "Settings", icon: <Settings size={18} />, href: "/student/settings" },
  ];

  const renderCourses = () => (
    <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold text-slate-950 dark:text-white">
        Enrolled Courses
      </h2>
      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Loading enrollments...
          </p>
        ) : error ? (
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : enrollments.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="font-semibold text-slate-950 dark:text-white">
              No approved courses yet
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Browse courses and enroll through checkout. Approved courses appear here.
            </p>
            <Link
              to="/student/catalog"
              className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
            >
              Browse Courses
            </Link>
          </div>
        ) : (
          enrollments.map((enrollment) => (
            <article
              key={enrollment.id}
              className="rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950 dark:text-white">
                    {enrollment.course_title}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {enrollment.instructor_name || "No instructor"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {courseDateRange({
                      start_date: enrollment.course_start_date,
                      end_date: enrollment.course_end_date,
                    })}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  {Math.round(enrollment.progress_percentage)}% complete
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-purple-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, enrollment.progress_percentage))}%` }} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {enrollment.is_completed ? "Course completed" : "Keep going — your next lesson is waiting."}
                </p>
                <Link to={`/course/${enrollment.course_id}`} className="inline-flex items-center rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                  {enrollment.is_completed ? "Review Course" : "Continue Learning"}
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );

  const renderCatalog = () => {
    const enrolledCourseIds = new Set(
      enrollments.map((enrollment) => String(enrollment.course_id)),
    );
    const categories = Array.from(
      new Set(courses.map((course) => course.category).filter(Boolean)),
    ) as string[];
    const filteredCourses = courses.filter((course) => {
      const searchText = `${course.title} ${course.description ?? ""} ${course.instructor_name ?? ""}`.toLowerCase();
      return searchText.includes(catalogSearch.toLowerCase()) &&
        (catalogCategory === "all" || course.category === catalogCategory);
    });

    return (
      <>
        <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} className={`${inputClass} w-full pl-9`} placeholder="Search courses, teachers, or topics" aria-label="Search courses" />
            </label>
            <select value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)} className={inputClass}>
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {coursesLoading ? (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Loading courses...
            </p>
          ) : coursesError ? (
            <p className="text-sm font-bold text-red-700 dark:text-red-300">
              {coursesError}
            </p>
          ) : filteredCourses.length === 0 ? (
            <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              No courses match your search.
            </p>
          ) : (
            filteredCourses.map((course) => {
              const isEnrolled = enrolledCourseIds.has(String(course.id));

              return (
                <article
                  key={course.id}
                  className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  {course.thumbnail_url ? <img src={course.thumbnail_url} alt="" className="mb-4 h-36 w-full rounded-lg object-cover" /> : <div className="mb-4 flex h-36 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white"><BookOpen className="h-10 w-10" /></div>}
                  {course.category && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">{course.category}</span>}
                  <h2 className="mt-3 font-semibold text-slate-950 dark:text-white">
                    {course.title}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {course.description || "No description added."}
                  </p>
                  <div className="mt-4 space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <p>Teacher: {course.instructor_name || "Not assigned"}</p>
                    <p>{courseDateRange(course)}</p>
                  </div>
                  {isEnrolled ? (
                    <button
                      type="button"
                      disabled
                      className="mt-5 inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white opacity-50 dark:bg-white dark:text-slate-950"
                    >
                      Already Enrolled
                    </button>
                  ) : (
                    <Link
                      to={`/checkout/${course.id}`}
                      className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      Enroll Now
                    </Link>
                  )}
                </article>
              );
            })
          )}
        </section>
      </>
    );
  };

  const renderSettings = () => (
    <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold text-slate-950 dark:text-white">
        Account Settings
      </h2>
      <form className="mt-4 space-y-3" onSubmit={handleProfileSubmit}>
        <input
          value={profileName}
          onChange={(event) => setProfileName(event.target.value)}
          className={inputClass}
          placeholder="Your name"
        />
        <input
          value={profilePhone}
          onChange={(event) => setProfilePhone(event.target.value)}
          className={inputClass}
          placeholder="Your phone number"
        />
        <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="font-semibold text-slate-950 dark:text-white">
            {profileName || currentUser?.name}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            {currentUser?.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {profileStatus && (
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {profileStatus}
            </p>
          )}
          <button
            type="submit"
            disabled={isSavingProfile || !profileName.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Save className="h-4 w-4" />
            {isSavingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </form>
    </section>
  );

  const renderDashboard = () => {
    const nextClass = liveClasses
      .filter((liveClass) => !liveClass.has_ended)
      .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())[0];
    const averageProgress = enrollments.length
      ? Math.round(enrollments.reduce((total, enrollment) => total + Number(enrollment.progress_percentage || 0), 0) / enrollments.length)
      : 0;

    return (
    <div className="space-y-6">
      <section className="student-theme-hero rounded-2xl p-6 text-white shadow-sm sm:p-8">
        <div className="relative z-10">
        <p className="student-theme-label"><Flame className="h-4 w-4" /> Night Study · Free theme</p>
        <h2 className="mt-1 text-3xl font-bold">{currentUser?.name?.split(" ")[0] || "Student"} 👋</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200">Follow the lantern path, keep your learning streak alive, and make your next lesson the warmest part of the day.</p>
        <div className="mt-5 flex flex-wrap gap-3"><Link to="/student/courses" className="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-950">Continue learning</Link><Link to="/student/catalog" className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/20">Explore courses</Link></div>
        <div className="student-theme-meta mt-6">
          <div><span>Campfire progress</span><strong>{averageProgress}%</strong></div>
          <div><span>Learning trail</span><strong>{enrollments.length ? `${enrollments.length} course${enrollments.length === 1 ? "" : "s"}` : "Start your first course"}</strong></div>
        </div>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-900 dark:bg-blue-950/40"><div className="flex items-center gap-3"><BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-300" /><div><p className="text-sm font-bold text-blue-800 dark:text-blue-200">My Courses</p><p className="text-2xl font-bold text-slate-950 dark:text-white">{isLoading ? "..." : enrollments.length}</p></div></div><p className="mt-3 text-xs font-semibold text-blue-700 dark:text-blue-300">{averageProgress}% average progress</p></article>
        <article className="rounded-lg border border-amber-300 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Coins className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                Coin Balance
              </p>
              <p className="text-2xl font-bold text-slate-950 dark:text-white">
                {rewardsLoading ? "..." : rewards.totalCoins}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-amber-900 dark:text-amber-100">
            Earn {rewards.coinsPerClass} coins for every class you attend.
          </p>
        </article>

        <article className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Classes Attended
              </p>
              <p className="text-2xl font-bold text-slate-950 dark:text-white">
                {rewardsLoading ? "..." : rewards.attendedClasses}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-lg border border-orange-300 bg-orange-50 p-5 shadow-sm dark:border-orange-800 dark:bg-orange-950/40">
          <div className="flex items-center gap-3">
            <Flame className="h-5 w-5 text-orange-600 dark:text-orange-300" />
            <div>
              <p className="text-sm font-bold text-orange-800 dark:text-orange-200">
                Full Week Streaks
              </p>
              <p className="text-2xl font-bold text-slate-950 dark:text-white">
                {rewardsLoading ? "..." : rewards.completedWeeks}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-orange-900 dark:text-orange-100">
            Monday to Friday earns {rewards.fullWeekBonus} bonus coins.
          </p>
        </article>
        <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40"><div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /><div><p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Next Class</p><p className="text-lg font-bold text-slate-950 dark:text-white">{liveClassesLoading ? "..." : nextClass ? new Date(nextClass.scheduled_start).toLocaleDateString([], { month: "short", day: "numeric" }) : "None"}</p></div></div><p className="mt-3 truncate text-xs font-semibold text-emerald-700 dark:text-emerald-300">{nextClass?.title || "No class scheduled"}</p></article>
      </section>

      {rewardsError && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {rewardsError}
        </p>
      )}

      {renderCourses()}

      <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950 dark:text-white">Upcoming live class</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{nextClass ? localLiveClassWindowLabel(nextClass) : "Your upcoming classes will appear here."}</p></div>{nextClass ? <Link to="/student/live-classes" className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950"><Video className="h-4 w-4" /> View class</Link> : <Link to="/student/catalog" className="text-sm font-bold text-blue-600">Browse courses</Link>}</div>{nextClass && <p className="mt-3 text-xs font-semibold text-slate-500">{nextClass.course_title} · {nextClass.teacher_name || "Teacher not assigned"}</p>}</section>

      <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            <Award className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-white">
              Certificates
            </h2>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Completed course certificates will appear here.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="font-semibold text-slate-950 dark:text-white">
            No certificates yet
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Finish an enrolled course to unlock its certificate.
          </p>
        </div>
      </section>
    </div>
    );
  };

  return (
    <DashboardLayout
      title={pageCopy[page].title}
      subtitle={pageCopy[page].subtitle}
      navItems={navItems}
      userRole="Student"
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">
            {pageCopy[page].title}
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            {pageCopy[page].subtitle}
          </p>
        </header>
        {page === "catalog"
          ? renderCatalog()
          : page === "courses"
          ? renderCourses()
          : page === "settings"
            ? renderSettings()
            : renderDashboard()}
      </div>
    </DashboardLayout>
  );
}
