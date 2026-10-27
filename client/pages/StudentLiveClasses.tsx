import DashboardCard from "@/components/DashboardCard";
import DashboardLayout from "@/components/DashboardLayout";
import {
  localLiveClassWindowLabel,
  localTimeZoneLabel,
  useLiveClasses,
} from "@/hooks/useLiveClasses";
import { getCurrentPortalUser } from "@/lib/portalData";
import { Award, BarChart3, BookOpen, LifeBuoy, Settings, Video } from "lucide-react";
import { Link } from "react-router-dom";

const navItems = [
  { label: "Dashboard", icon: <BarChart3 size={18} />, href: "/student" },
  { label: "Enrolled Courses", icon: <BookOpen size={18} />, href: "/student/courses" },
  { label: "Live Classes", icon: <Video size={18} />, href: "/student/live-classes" },
  { label: "Help Center", icon: <LifeBuoy size={18} />, href: "/student/help" },
  { label: "Settings", icon: <Settings size={18} />, href: "/student/settings" },
];

export default function StudentLiveClasses() {
  const currentUser = getCurrentPortalUser();
  const { liveClasses, isLoading, error } = useLiveClasses({ studentId: currentUser?.id });
  const upcoming = liveClasses.filter((liveClass) => !liveClass.has_ended);
  const past = liveClasses.filter((liveClass) => liveClass.has_ended);

  return (
    <DashboardLayout
      title="Live Classes"
      subtitle={`Join scheduled weekday classes. Times are shown in your local time (${localTimeZoneLabel()}).`}
      navItems={navItems}
      userRole="Student"
    >
      <section className="grid gap-5 md:grid-cols-3">
        <DashboardCard title="Upcoming" value={upcoming.length} icon={<Video size={22} />} trend="Enrolled courses" />
        <DashboardCard title="Joinable Now" value={liveClasses.filter((liveClass) => liveClass.can_join).length} icon={<BookOpen size={22} />} trend="Open classes" />
        <DashboardCard title="Completed" value={past.length} icon={<Award size={22} />} trend="Past classes" />
      </section>

      <section className="mt-6 space-y-4">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading live classes...</p>
        ) : error ? (
          <p className="rounded-xl bg-red-500/10 p-4 text-sm font-semibold text-red-200">{error}</p>
        ) : liveClasses.length === 0 ? (
          <DashboardCard title="No live classes" icon={<Video size={22} />} description="Your enrolled courses do not have scheduled live classes yet." />
        ) : (
          liveClasses.map((liveClass) => (
            <DashboardCard key={liveClass.id} title={liveClass.title} icon={<Video size={22} />} description={liveClass.course_title}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-300">{localLiveClassWindowLabel(liveClass)}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Teacher: {liveClass.teacher_name || "Not assigned"}
                  </p>
                  <p className="mt-2 font-mono text-xs font-semibold tracking-wide text-blue-200">
                    Meeting ID: {liveClass.meeting_id || "Preparing meeting..."}
                  </p>
                  {!liveClass.can_join && !liveClass.has_ended && liveClass.join_opens_at && (
                    <p className="mt-2 text-xs font-semibold text-blue-200">
                      Opens at {new Date(liveClass.join_opens_at).toLocaleString()} in your local time
                    </p>
                  )}
                  {liveClass.has_ended && (
                    <p className="mt-2 text-xs font-semibold text-slate-400">Class ended</p>
                  )}
                </div>
                <Link
                  to={`/live-class/${liveClass.id}`}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ${
                    liveClass.can_join
                      ? "bg-white text-slate-950"
                      : "pointer-events-none bg-white/10 text-slate-500"
                  }`}
                  aria-disabled={!liveClass.can_join}
                >
                  <Video className="h-4 w-4" /> Join Class
                </Link>
              </div>
            </DashboardCard>
          ))
        )}
      </section>
    </DashboardLayout>
  );
}
