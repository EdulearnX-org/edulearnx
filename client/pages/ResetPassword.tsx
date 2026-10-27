import Navbar from "@/components/Navbar";
import { resetPortalPassword } from "@/lib/portalData";
import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This reset link is missing its token. Request a new password reset email.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPortalPassword(token, password);
      navigate("/signin", { replace: true, state: { passwordReset: true } });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update your password.",
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
          <h1 className="text-3xl font-bold text-slate-900">Choose a new password</h1>
          {!token && <p role="alert" className="mt-4 text-sm font-semibold text-red-700">This reset link is invalid. <Link to="/forgot-password" className="underline">Request a new password reset email.</Link></p>}
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <label htmlFor="new-password" className="block text-sm font-semibold text-slate-900">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-900 outline-none focus:border-edu-purple focus:bg-white"
            />
            <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-900">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-900 outline-none focus:border-edu-purple focus:bg-white"
            />
            {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
            <button disabled={isSubmitting || !token} className="btn-primary w-full">
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </form>
          <Link to="/signin" className="mt-6 inline-block text-sm font-semibold text-edu-dark-blue hover:text-edu-purple">
            Back to sign in
          </Link>
        </section>
      </main>
    </div>
  );
}
