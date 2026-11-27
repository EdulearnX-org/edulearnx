import DashboardLayout from "@/components/DashboardLayout";
import { getCurrentPortalUser } from "@/lib/portalData";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, KeyRound, LockKeyhole, LogOut, MailCheck, ShieldCheck, Smartphone } from "lucide-react";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 dark:border-white/10 dark:bg-slate-950 dark:text-white";
const panelClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900";

type TwoFactorStatus = { enabled: boolean; required_at: string | null; defer_used: boolean };

export default function AccountSecurity() {
  const user = getCurrentPortalUser();
  const navigate = useNavigate();
  const isStudent = user?.role === "student";
  const [passwords, setPasswords] = useState({ current_password: "", password: "", confirm: "" });
  const [passwordStatus, setPasswordStatus] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);
  const [studentOtpRequired, setStudentOtpRequired] = useState(true);
  const [securityStatus, setSecurityStatus] = useState("Loading account protection…");
  const [setupSecret, setSetupSecret] = useState("");
  const [setupUri, setSetupUri] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (isStudent) {
          const response = await fetch("/api/student/security-settings", { credentials: "include", cache: "no-store" });
          const payload = await response.json();
          if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load student security policy.");
          if (active) {
            setStudentOtpRequired(Boolean(payload.data.admin_required || payload.data.email_otp_enabled));
            setSecurityStatus("");
          }
        } else {
          const response = await fetch("/api/auth/two-factor/status", { credentials: "include", cache: "no-store" });
          const payload = await response.json();
          if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load authenticator status.");
          if (active) {
            setTwoFactor(payload.data);
            setSecurityStatus("");
          }
        }
      } catch (error) {
        if (active) setSecurityStatus(error instanceof Error ? error.message : "Unable to load account protection.");
      }
    };
    void load();
    return () => { active = false; };
  }, [isStudent]);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordStatus("");
    if (passwords.password !== passwords.confirm) {
      setPasswordStatus("The new passwords do not match.");
      return;
    }
    if (passwords.password.length < 8) {
      setPasswordStatus("Use at least 8 characters for your new password.");
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: passwords.current_password, password: passwords.password }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to change password.");
      setPasswords({ current_password: "", password: "", confirm: "" });
      setPasswordStatus("Password changed. Other signed-in sessions have been signed out.");
    } catch (error) {
      setPasswordStatus(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const startAuthenticator = async () => {
    setSettingUp(true);
    setSecurityStatus("");
    try {
      const response = await fetch("/api/auth/two-factor/setup", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to start authenticator setup.");
      setSetupSecret(payload.data.secret);
      setSetupUri(payload.data.otpauth_url);
      setSecurityStatus("Add the key to your authenticator app, then enter the six-digit code.");
    } catch (error) {
      setSecurityStatus(error instanceof Error ? error.message : "Unable to start authenticator setup.");
    } finally {
      setSettingUp(false);
    }
  };

  const confirmAuthenticator = async (event: FormEvent) => {
    event.preventDefault();
    setSettingUp(true);
    try {
      const response = await fetch("/api/auth/two-factor/confirm", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: verificationCode }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Authenticator code was not accepted.");
      setTwoFactor((current) => current ? { ...current, enabled: true } : { enabled: true, required_at: null, defer_used: true });
      setSetupSecret("");
      setSetupUri("");
      setVerificationCode("");
      setSecurityStatus("Authenticator protection enabled. Sign in again to continue.");
      window.setTimeout(() => navigate("/signin", { replace: true }), 1600);
    } catch (error) {
      setSecurityStatus(error instanceof Error ? error.message : "Unable to confirm authenticator.");
    } finally {
      setSettingUp(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to sign out.");
      navigate("/signin", { replace: true });
    } catch (error) {
      setSecurityStatus(error instanceof Error ? error.message : "Unable to sign out.");
      setSigningOut(false);
    }
  };

  const navItems = isStudent
    ? [
        { label: "Dashboard", icon: <Activity size={18} />, href: "/student" },
        { label: "Security", icon: <ShieldCheck size={18} />, href: "/student/security" },
      ]
    : [
        { label: "Dashboard", icon: <Activity size={18} />, href: "/teacher" },
        { label: "Security", icon: <ShieldCheck size={18} />, href: "/teacher/security" },
      ];

  return (
    <DashboardLayout title="Account Security" subtitle="Protect your EduLearnX account and manage sign-in security." navItems={navItems} userRole={isStudent ? "Student" : "Teacher"}>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-xl sm:p-8">
          <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div><div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs font-bold text-cyan-100"><ShieldCheck size={14} /> SECURITY CENTRE</div><h1 className="mt-4 text-3xl font-black tracking-tight">Your account. Your protection.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Review sign-in safeguards, strengthen your password and safely end your current session.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><LockKeyhole className="h-9 w-9 text-cyan-200" /></div>
          </div>
        </header>

        {securityStatus && <div role="status" className="rounded-xl border border-amber-300/30 bg-amber-50 p-4 text-sm font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{securityStatus}</div>}

        <section className="grid gap-4 md:grid-cols-2">
          <article className={panelClass}>
            <div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><MailCheck size={21} /></span><div className="min-w-0"><h2 className="font-bold text-slate-950 dark:text-white">Email verification</h2><p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{user?.email || "Your registered email"}</p></div></div>
            {isStudent ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 size={17} /> Email OTP {studentOtpRequired ? "is required at sign-in" : "is enabled"}</div> : <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">Use an email address you can access. Password recovery and important account notices depend on it.</p>}
          </article>

          <article className={panelClass}>
            <div className="flex items-start gap-3"><span className="rounded-xl bg-cyan-100 p-3 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200"><Smartphone size={21} /></span><div><h2 className="font-bold text-slate-950 dark:text-white">{isStudent ? "Student sign-in protection" : "Authenticator app"}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{isStudent ? "A one-time code is sent to your email when signing in." : "Add another verification step using an authenticator app."}</p></div></div>
            {isStudent ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-100"><CheckCircle2 className="mr-2 inline h-4 w-4" /> Authenticator-app 2FA is not used for student accounts. Email OTP is the student sign-in safeguard.</div> : <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Authenticator status</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${twoFactor?.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"}`}>{twoFactor?.enabled ? "Enabled" : "Not enabled"}</span></div>
              {!twoFactor?.enabled && !setupSecret && <button type="button" disabled={settingUp} onClick={() => void startAuthenticator()} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">{settingUp ? "Preparing…" : "Set up authenticator app"}</button>}
              {setupSecret && <form onSubmit={confirmAuthenticator} className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-300/20 dark:bg-cyan-950/20"><p className="text-sm font-bold text-slate-900 dark:text-white">1. Add this key to your authenticator app</p><code className="block break-all rounded-lg bg-white p-3 text-sm font-bold text-slate-900 dark:bg-slate-950 dark:text-cyan-100">{setupSecret}</code><div className="flex flex-wrap gap-4"><button type="button" onClick={() => void navigator.clipboard?.writeText(setupSecret)} className="text-xs font-bold text-cyan-800 underline dark:text-cyan-200">Copy setup key</button><button type="button" onClick={() => void navigator.clipboard?.writeText(setupUri)} className="text-xs font-bold text-cyan-800 underline dark:text-cyan-200">Copy authenticator URI</button></div><p className="text-sm font-bold text-slate-900 dark:text-white">2. Enter the six-digit code</p><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className={inputClass} /><button disabled={settingUp || verificationCode.length !== 6} className="w-full rounded-xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Verify and enable</button><button type="button" onClick={() => { setSetupSecret(""); setSetupUri(""); }} className="w-full text-xs font-semibold text-slate-500">Cancel setup</button></form>}
            </div>}
          </article>
        </section>

        <section className={panelClass}>
          <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200"><KeyRound size={21} /></span><div><h2 className="font-bold text-slate-950 dark:text-white">Change password</h2><p className="text-sm text-slate-500 dark:text-slate-400">Use a unique password that you do not reuse on other websites.</p></div></div>
          <form onSubmit={changePassword} className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2">Current password<input required type="password" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} className={inputClass} /></label>
            <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">New password<input required minLength={8} maxLength={72} type="password" autoComplete="new-password" value={passwords.password} onChange={(event) => setPasswords({ ...passwords, password: event.target.value })} className={inputClass} /><span className="block text-xs font-normal text-slate-500">At least 8 characters.</span></label>
            <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">Confirm new password<input required minLength={8} maxLength={72} type="password" autoComplete="new-password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} className={inputClass} /></label>
            <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">{passwordStatus && <p role="status" className="text-sm font-semibold text-slate-600 dark:text-slate-300">{passwordStatus}</p>}<button disabled={savingPassword} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">{savingPassword ? "Updating…" : "Update password"}</button></div>
          </form>
        </section>

        <section className={`${panelClass} flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex items-start gap-3"><span className="rounded-xl bg-rose-100 p-3 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"><LogOut size={21} /></span><div><h2 className="font-bold text-slate-950 dark:text-white">Sign out of this device</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">End your current EduLearnX session when using a shared device.</p></div></div>
          <button type="button" onClick={() => void signOut()} disabled={signingOut} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-400/20 dark:text-rose-200 dark:hover:bg-rose-950/30">{signingOut ? "Signing out…" : "Sign out"}</button>
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> Changing your password signs out other active sessions. Authenticator setup also requires you to sign in again after it is enabled.</p>
      </div>
    </DashboardLayout>
  );
}
