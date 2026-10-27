import Navbar from "@/components/Navbar";
import EduLearnXLogo from "@/components/EduLearnXLogo";
import { portalPathForRole, registerPortal } from "@/lib/portalData";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function SignUp() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const user = await registerPortal(email, password, fullName);
      navigate(portalPathForRole(user.role), {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign up.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar />

      <section className="relative px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute top-20 -left-40 h-80 w-80 rounded-full bg-edu-purple/20 glow-blob"></div>
        <div
          className="absolute top-40 -right-40 h-80 w-80 rounded-full bg-edu-light-blue/20 glow-blob"
          style={{ animationDelay: "2s" }}
        ></div>

        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="mb-6">
              <EduLearnXLogo />
            </div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-edu-purple/10 px-4 py-2 text-sm font-semibold text-edu-purple">
              <ShieldCheck className="h-4 w-4" />
              Create your student account
            </div>
            <h1 className="mb-5 text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
              Sign up for EduLearnX
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-slate-600">
              Join the learning community and access live classes, courses, and
              progress tracking.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="fullName"
                  className="mb-2 block text-sm font-semibold text-slate-900"
                >
                  Full name
                </label>
                <div className="relative">
                  <UserRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-slate-900 outline-none transition focus:border-edu-purple focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-slate-900"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value.toLowerCase())}
                    placeholder="Enter your email"
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-slate-900 outline-none transition focus:border-edu-purple focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-slate-900"
                >
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-slate-900 outline-none transition focus:border-edu-purple focus:bg-white"
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base"
              >
                {isSubmitting ? "Signing Up..." : "Create Account"} <ArrowRight size={18} />
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-6">
              <p className="text-sm text-slate-600">
                Already have an account?{' '}
                <Link to="/signin" className="font-semibold text-edu-dark-blue hover:text-edu-purple">
                  Sign in
                </Link>
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Want to teach?{" "}
                <Link
                  to="/become-tutor"
                  className="font-semibold text-edu-dark-blue hover:text-edu-purple"
                >
                  Apply as a tutor
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
