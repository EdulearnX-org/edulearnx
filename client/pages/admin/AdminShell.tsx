import DashboardLayout from "@/components/DashboardLayout";
import {
  BarChart3,
  BookOpen,
  BadgePercent,
  Clock,
  Settings,
  School,
  Users,
  Video,
} from "lucide-react";
import { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ADMIN_FEATURES, type AdminFeature, type AdminPermissions } from "../../../shared/adminPermissions";

const navItems = [
  { label: "Dashboard", icon: <BarChart3 size={18} />, href: "/admin", feature: "overview" },
  { label: "Students", icon: <Users size={18} />, href: "/admin/students", feature: "users" },
  { label: "Teachers", icon: <School size={18} />, href: "/admin/teachers", feature: "users" },
  { label: "Courses", icon: <BookOpen size={18} />, href: "/admin/courses", feature: "courses" },
  { label: "Live Classes", icon: <Video size={18} />, href: "/admin/live-classes", feature: "liveClasses" },
  { label: "Deals", icon: <BadgePercent size={18} />, href: "/admin/deals", feature: "deals" },
  {
    label: "Enrollment Requests",
    icon: <Clock size={18} />,
    href: "/admin/enrollment-requests",
    feature: "enrollmentRequests",
  },
  {
    label: "Tutor Applications",
    icon: <School size={18} />,
    href: "/admin/tutor-applications",
    feature: "tutorApplications",
  },
  { label: "Settings", icon: <Settings size={18} />, href: "/admin/settings", feature: "settings" },
] satisfies Array<{ label: string; icon: ReactNode; href: string; feature: AdminFeature }>;

type AdminShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export default function AdminShell({ title, subtitle, children }: AdminShellProps) {
  const [permissions, setPermissions] = useState<AdminPermissions | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/admin/permissions/me")
      .then((response) => response.json())
      .then((payload) => {
        if (isMounted && payload.success) setPermissions(payload.data.permissions);
      })
      .catch(() => setPermissions(null));
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <DashboardLayout
      title={title}
      subtitle={subtitle}
      navItems={navItems.filter((item) => permissions?.[item.feature])}
      userRole="Admin"
    >
      {children}
    </DashboardLayout>
  );
}
