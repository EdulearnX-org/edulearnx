import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { portalPathForRole } from "@/lib/portalData";
import { useCurrentUser } from "@/lib/user";
import EduLearnXLogo from "@/components/EduLearnXLogo";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const currentUser = useCurrentUser();
  const portalPath = currentUser ? portalPathForRole(currentUser.role) : "/signin";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "glass-light shadow-xl"
          : "bg-white/40 backdrop-blur-xl border-b border-white/20 dark:bg-slate-950/50 dark:border-slate-800/70"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <EduLearnXLogo compact />

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link to="/" className="nav-link">
              Home
            </Link>
            <Link to="/courses" className="nav-link">
              Courses
            </Link>
            <Link to="/contact" className="nav-link">
              Contact
            </Link>
            <Link to="/become-tutor" className="nav-link">
              Become a Tutor
            </Link>
          </div>

          {/* Desktop Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle />
            <Link to={portalPath} className="btn-secondary">
              {currentUser ? "Portal" : "Sign In"}
            </Link>
            <Link to="/signup" className="btn-primary">
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="rounded-lg p-2 transition-colors hover:bg-white/20 dark:hover:bg-slate-800"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-edu-dark-blue dark:text-slate-100" />
              ) : (
                <Menu className="w-6 h-6 text-edu-dark-blue dark:text-slate-100" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-white/20 dark:border-slate-800/70">
            <div className="flex flex-col gap-3 pt-4">
              <Link
                to="/"
                className="px-4 py-2 text-slate-700 font-medium hover:bg-white/20 rounded-lg transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                to="/courses"
                className="px-4 py-2 text-slate-700 font-medium hover:bg-white/20 rounded-lg transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Courses
              </Link>
              <Link
                to="/contact"
                className="px-4 py-2 text-slate-700 font-medium hover:bg-white/20 rounded-lg transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Contact
              </Link>
              <Link
                to="/become-tutor"
                className="px-4 py-2 text-slate-700 font-medium hover:bg-white/20 rounded-lg transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Become a Tutor
              </Link>
              <div className="flex flex-col gap-2 pt-2">
                <Link
                  to={portalPath}
                  className="btn-secondary w-full text-center"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {currentUser ? "Portal" : "Sign In"}
                </Link>
                <Link
                  to="/signup"
                  className="btn-primary w-full text-center"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
