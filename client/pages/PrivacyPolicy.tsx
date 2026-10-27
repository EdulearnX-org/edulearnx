import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-edu-purple">
          EduLearnX
        </p>
        <h1 className="mb-6 text-4xl font-bold text-slate-900">
          Privacy Policy
        </h1>
        <div className="space-y-5 text-slate-600">
          <p>
            EduLearnX uses account information such as your name, email address,
            role, course activity, enrollment requests, and progress data to
            provide online learning, authentication, support, and account
            management.
          </p>
          <p>
            Your email and password let you access your EduLearnX account.
            Passwords are stored as secure hashes, and session cookies keep you
            signed in. We do not sell personal information.
          </p>
          <p>
            Enrollment information is used only to review course access requests
            and support related account activity. Payment proof submissions may
            include a receipt image and sender account title and number for
            payment verification.
          </p>
          <p>
            To request access, correction, or deletion of your account data,
            contact EduLearnX support at team@edulearnx.org.
          </p>
        </div>
        <Link to="/" className="btn-primary mt-10 inline-flex">
          Back Home
        </Link>
      </main>
    </div>
  );
}
