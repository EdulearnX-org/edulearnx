import { ReactNode, useState } from "react";
import EduLearnXLogo from "@/components/EduLearnXLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { useStudentRewards } from "@/hooks/useStudentRewards";
import {
  BookOpen,
  Coins,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  PanelLeftClose,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentPortalUser, signOutPortal } from "@/lib/portalData";

type StudentThemeId = "night-study" | "neon-city";

const NEON_CITY_THEME_COST = 100;

interface NavItem {
  label: string;
  icon: ReactNode;
  href: string;
}

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
  navItems: NavItem[];
  userRole: "Admin" | "Teacher" | "Student";
}

export default function DashboardLayout({
  children,
  navItems,
  userRole,
}: DashboardLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(true);
  const [logoutError, setLogoutError] = useState("");
  const isStudent = userRole === "Student";
  const currentPortalUser = isStudent ? getCurrentPortalUser() : null;
  const { rewards, isLoading: rewardsLoading } = useStudentRewards(
    currentPortalUser?.id,
  );
  const [studentThemeEnabled, setStudentThemeEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem("edulearnx-student-theme") !== "off";
  });
  const [studentThemeId, setStudentThemeId] = useState<StudentThemeId>(() => {
    if (typeof window === "undefined") {
      return "night-study";
    }

    const savedTheme = window.localStorage.getItem("edulearnx-student-theme-id");
    const neonUnlocked = window.localStorage.getItem("edulearnx-neon-city-unlocked") === "true";
    return savedTheme === "neon-city" && neonUnlocked ? "neon-city" : "night-study";
  });
  const [neonCityUnlocked, setNeonCityUnlocked] = useState(() => (
    typeof window !== "undefined" &&
    window.localStorage.getItem("edulearnx-neon-city-unlocked") === "true"
  ));
  const [themeCoinsSpent, setThemeCoinsSpent] = useState(() => {
    if (typeof window === "undefined") {
      return 0;
    }

    return Number(window.localStorage.getItem("edulearnx-theme-coins-spent") ?? 0) || 0;
  });
  const location = useLocation();
  const navigate = useNavigate();
  const dashboardPath =
    userRole === "Admin"
      ? "/admin"
      : userRole === "Teacher"
        ? "/teacher"
        : "/student";
  const menuItems =
    userRole === "Admin"
      ? navItems
      : userRole === "Student"
        ? [
            {
              label: "Dashboard",
              href: "/student",
              icon: <LayoutDashboard className="h-5 w-5" />,
            },
            {
              label: "Courses",
              href: "/student/catalog",
              icon: <BookOpen className="h-5 w-5" />,
            },
            {
              label: "Enrolled Courses",
              href: "/student/courses",
              icon: <BookOpen className="h-5 w-5" />,
            },
            {
              label: "Live Classes",
              href: "/student/live-classes",
              icon: <GraduationCap className="h-5 w-5" />,
            },
            {
              label: "Help Center",
              href: "/student/help",
              icon: <Users className="h-5 w-5" />,
            },
            {
              label: "Settings",
              href: "/student/settings",
              icon: <Settings className="h-5 w-5" />,
            },
          ]
        : [
          {
            label: "Dashboard",
            href: dashboardPath,
            icon: <LayoutDashboard className="h-5 w-5" />,
          },
        ];
  const handleLogout = async () => {
    setLogoutError("");
    try {
      await signOutPortal();
      navigate("/signin", { replace: true });
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  const toggleStudentTheme = () => {
    setStudentThemeEnabled((enabled) => {
      const nextEnabled = !enabled;
      window.localStorage.setItem("edulearnx-student-theme", nextEnabled ? "on" : "off");
      return nextEnabled;
    });
  };

  const availableThemeCoins = Math.max(0, rewards.totalCoins - themeCoinsSpent);
  const selectStudentTheme = (nextTheme: StudentThemeId) => {
    if (nextTheme === "neon-city" && !neonCityUnlocked) {
      if (rewardsLoading || availableThemeCoins < NEON_CITY_THEME_COST) {
        return;
      }

      const nextSpent = themeCoinsSpent + NEON_CITY_THEME_COST;
      window.localStorage.setItem("edulearnx-neon-city-unlocked", "true");
      window.localStorage.setItem("edulearnx-theme-coins-spent", String(nextSpent));
      setThemeCoinsSpent(nextSpent);
      setNeonCityUnlocked(true);
    }

    window.localStorage.setItem("edulearnx-student-theme-id", nextTheme);
    setStudentThemeId(nextTheme);
  };

  const themedStudentShell = isStudent && studentThemeEnabled;
  const studentShellClass = isStudent ? `student-theme-shell ${studentThemeId}` : "";

  return (
    <div className={`min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-white ${studentShellClass}`}>
      {isStudent && <div aria-hidden="true" className={`student-theme-art ${studentThemeId} ${studentThemeEnabled ? "is-active" : ""}`} />}
      <button
        type="button"
        aria-label={menuOpen ? "Hide menu" : "Show menu"}
        onClick={() => setMenuOpen((open) => !open)}
        className="fixed left-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-950 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
      >
        {menuOpen ? (
          <PanelLeftClose className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col transition-transform duration-300 ${themedStudentShell ? "student-theme-sidebar border-white/10" : "border-r border-slate-300 bg-white dark:border-slate-800 dark:bg-slate-900"} ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <header className={`border-b px-5 py-4 pl-16 ${themedStudentShell ? "border-white/10" : "border-slate-300 dark:border-slate-800"}`}>
          <EduLearnXLogo compact />
        </header>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
          <div className="space-y-2">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.href;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition ${
                    isActive
                      ? themedStudentShell
                        ? "bg-amber-300 text-slate-950 shadow-[0_8px_24px_rgba(251,191,36,0.2)] hover:bg-amber-200"
                        : "bg-edu-dark-blue text-white shadow-sm hover:bg-edu-dark-blue/90 dark:bg-edu-light-blue dark:text-slate-950 dark:hover:bg-edu-light-blue/90"
                      : themedStudentShell
                        ? "text-slate-200 hover:bg-white/10"
                        : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
        <footer className={`border-t px-4 py-4 ${themedStudentShell ? "border-white/10" : "border-slate-300 dark:border-slate-800"}`}>
          <div className="space-y-3">
          <button
            type="button"
            onClick={handleLogout}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition ${themedStudentShell ? "text-rose-200 hover:bg-rose-400/10" : "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"}`}
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
          {logoutError && (
            <p role="alert" className="px-4 text-sm font-semibold text-red-700 dark:text-red-300">
              {logoutError}
            </p>
          )}
          {isStudent && (
            <div className={`student-theme-picker rounded-lg border p-3 ${themedStudentShell ? "border-white/10 bg-black/20" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`text-xs font-extrabold uppercase tracking-[0.14em] ${themedStudentShell ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>Student themes</span>
                <button
                  type="button"
                  onClick={toggleStudentTheme}
                  className={`text-xs font-bold transition ${themedStudentShell ? "text-amber-300 hover:text-amber-200" : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"}`}
                  aria-pressed={studentThemeEnabled}
                >
                  {studentThemeEnabled ? "On" : "Off"}
                </button>
              </div>
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => selectStudentTheme("night-study")}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-bold transition ${studentThemeId === "night-study" ? themedStudentShell ? "bg-amber-300 text-slate-950" : "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : themedStudentShell ? "text-slate-200 hover:bg-white/10" : "text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                  aria-pressed={studentThemeId === "night-study"}
                >
                  <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Night Study</span>
                  <span className="text-[11px] font-extrabold uppercase opacity-70">Free</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectStudentTheme("neon-city")}
                  disabled={!neonCityUnlocked && (rewardsLoading || availableThemeCoins < NEON_CITY_THEME_COST)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${studentThemeId === "neon-city" ? themedStudentShell ? "bg-fuchsia-400 text-slate-950" : "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : themedStudentShell ? "text-slate-200 hover:bg-white/10" : "text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                  aria-pressed={studentThemeId === "neon-city"}
                >
                  <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /> Neon City</span>
                  <span className="flex items-center gap-1 text-[11px] font-extrabold uppercase opacity-80">{neonCityUnlocked ? "Unlocked" : <><Coins className="h-3 w-3" /> 100</>}</span>
                </button>
              </div>
              <p className={`mt-2 text-[11px] font-semibold ${themedStudentShell ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`} aria-live="polite">
                {neonCityUnlocked ? "Neon City is unlocked on this account." : rewardsLoading ? "Checking your coin balance..." : `${availableThemeCoins} coins available · 100 needed`}
              </p>
            </div>
          )}
          <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${themedStudentShell ? "border-white/10 bg-black/20" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"}`}>
            <span className={`text-sm font-bold ${themedStudentShell ? "text-slate-200" : "text-slate-800 dark:text-slate-100"}`}>
              Theme
            </span>
            <ThemeToggle />
          </div>
          </div>
        </footer>
      </aside>

      <main
        className={`min-h-screen px-4 py-20 transition-[margin,padding] duration-300 sm:px-6 lg:pr-8 ${themedStudentShell ? "student-theme-main" : ""} ${
          menuOpen ? "ml-72 lg:pl-8" : "ml-0 lg:pl-8"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
