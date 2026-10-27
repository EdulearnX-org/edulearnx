import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";

export default function AuthCallback() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-xl px-4 pb-20 pt-32 text-center">
        <h1 className="text-3xl font-bold text-slate-900">This sign-in link is no longer supported</h1>
        <p className="mt-4 text-slate-600">Sign in with your EduLearnX email and password. If you need a new password, request a reset email.</p>
        <div className="mt-8 flex justify-center gap-4">
          <Link to="/signin" className="btn-primary">Sign in</Link>
          <Link to="/forgot-password" className="btn-secondary">Reset password</Link>
        </div>
      </main>
    </div>
  );
}
