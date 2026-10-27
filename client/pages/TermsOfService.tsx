import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-edu-purple">
          EduLearnX
        </p>
        <h1 className="mb-6 text-4xl font-bold text-slate-900">
          Terms of Service
        </h1>
        <div className="space-y-5 text-slate-600">
          <p>
            By using EduLearnX, you agree to use the platform for lawful learning
            and teaching activities and to provide accurate account information.
          </p>
          <p>
            Course access, enrollment approval, progress tracking, and tutor
            applications may depend on information submitted through the
            platform.
          </p>
          <p>
            You are responsible for keeping your account credentials secure and
            for activity performed through your account.
          </p>
          <p>
            EduLearnX may update these terms as the platform changes. Continued
            use of the service means you accept the current terms.
          </p>
        </div>
        <Link to="/" className="btn-primary mt-10 inline-flex">
          Back Home
        </Link>
      </main>
    </div>
  );
}
