import { Link } from "react-router-dom";
import EduLearnXLogo from "@/components/EduLearnXLogo";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="mb-4">
              <EduLearnXLogo compact />
            </div>
            <p className="text-slate-400 text-sm">
              Empowering learners worldwide with quality education.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Courses</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <Link to="/courses" className="hover:text-white transition">
                  All Courses
                </Link>
              </li>
              <li>
                <Link to="/courses" className="hover:text-white transition">
                  Languages
                </Link>
              </li>
              <li>
                <Link to="/courses" className="hover:text-white transition">
                  Sciences
                </Link>
              </li>
              <li>
                <Link to="/courses" className="hover:text-white transition">
                  Technology
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <Link to="/about" className="hover:text-white transition">
                  About
                </Link>
              </li>
              <li>
                <Link to="/blog" className="hover:text-white transition">
                  Blog
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/careers" className="hover:text-white transition">
                  Careers
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <Link to="/privacy" className="hover:text-white transition">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-white transition">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/refund" className="hover:text-white transition">
                  Refund Policy
                </Link>
              </li>
            </ul>
            <h4 className="font-semibold mt-6 mb-4">Contact</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a
                  href="mailto:team@edulearnx.org"
                  className="hover:text-white transition"
                >
                  team@edulearnx.org
                </a>
              </li>
              <li className="mt-4">
                <div className="flex gap-4">
                  <a
                    href="https://twitter.com"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition"
                  >
                    Twitter
                  </a>
                  <a
                    href="https://linkedin.com"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition"
                  >
                    LinkedIn
                  </a>
                  <a
                    href="https://facebook.com"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition"
                  >
                    Facebook
                  </a>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-700 pt-8">
          <p className="text-sm text-slate-400 text-center">
            © 2026 EduLearnX. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
