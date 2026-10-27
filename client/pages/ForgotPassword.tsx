import Navbar from "@/components/Navbar";
import { requestPasswordReset } from "@/lib/portalData";
import { ArrowLeft, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to request a password reset.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-lg px-4 pb-20 pt-32 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-3xl font-bold text-slate-900">Reset your password</h1>
          <p className="mt-3 text-slate-600">
            Enter the email address on your account and we’ll send a reset link.
          </p>
          {sent ? (
            <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              If an account exists for that address, a password reset email is on its way.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <label htmlFor="reset-email" className="block text-sm font-semibold text-slate-900">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-slate-900 outline-none focus:border-edu-purple focus:bg-white"
                />
              </div>
              {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
              <button disabled={isSubmitting} className="btn-primary w-full">
                {isSubmitting ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}
          <Link to="/signin" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-edu-dark-blue hover:text-edu-purple">
            <ArrowLeft size={16} /> Back to sign in
          </Link>
        </section>
      </main>
    </div>
  );
}
