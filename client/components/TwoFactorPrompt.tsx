import { useEffect, useState } from "react";
import { usePortalAuth } from "@/lib/portalData";
import { readApiResponse } from "@/lib/api";
import EduLearnXLogo from "@/components/EduLearnXLogo";

type SetupPayload = { secret: string; otpauth_url: string; issuer: string; account: string };
type Status = { enabled: boolean; required_at: string | null; defer_used: boolean };

async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/auth/two-factor/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await readApiResponse(response);
  if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to complete two-factor setup.");
  return payload.data;
}

export default function TwoFactorPrompt() {
  const { user } = usePortalAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user || user.two_factor_enabled) { setStatus(null); setSetup(null); setClosed(false); return; }
    request("status").then((value: Status) => { if (active) setStatus(value); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Unable to check security setup."); });
    return () => { active = false; };
  }, [user?.id, user?.two_factor_enabled]);

  if (!user || user.two_factor_enabled || !status || closed) return null;
  const deadline = status.required_at ? new Date(status.required_at).getTime() : 0;
  const deferredAndWaiting = status.defer_used && deadline > Date.now();
  if (deferredAndWaiting) return null;

  const start = async () => {
    setBusy(true); setError("");
    try { setSetup(await request("setup") as SetupPayload); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to start setup."); }
    finally { setBusy(false); }
  };
  const confirm = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await request("confirm", { code });
      setStatus({ ...status, enabled: true }); setSetup(null);
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to verify code."); }
    finally { setBusy(false); }
  };
  const defer = async () => {
    setBusy(true); setError("");
    try { await request("defer", {}); setClosed(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to postpone setup."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="two-factor-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-5 flex justify-center"><EduLearnXLogo /></div>
        {!setup ? <>
          <h2 id="two-factor-title" className="text-2xl font-bold text-slate-900">Protect your EduLearnX account</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Set up Google Authenticator to add a second security step to your account. You will need a fresh six-digit code when signing in.</p>
          <div className="mt-5 rounded-xl bg-edu-purple/10 p-4 text-sm text-slate-700">Your account has a three-day setup window. You can postpone the reminder once for another three days.</div>
          {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
          <button disabled={busy} onClick={start} className="btn-primary mt-6 w-full">{busy ? "Preparing..." : "Set up authenticator"}</button>
          {!status.defer_used && deadline > Date.now() && <button disabled={busy} onClick={defer} className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">Remind me in 3 days</button>}
        </> : <>
          <h2 id="two-factor-title" className="text-2xl font-bold text-slate-900">Connect Google Authenticator</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Open Google Authenticator on your phone and add a new account.</li>
            <li>Choose the option to enter a setup key manually.</li>
            <li>Use the account name and key below, then enter the six-digit code.</li>
          </ol>
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</p>
            <p className="mt-1 break-all font-semibold text-slate-900">EduLearnX · {setup.account}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Setup key</p>
            <p className="mt-1 break-all font-mono text-lg font-bold tracking-wider text-slate-900">{setup.secret}</p>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(setup.secret)} className="mt-2 text-sm font-semibold text-edu-dark-blue">Copy setup key</button>
          </div>
          <form onSubmit={confirm} className="mt-5 space-y-3">
            <label htmlFor="two-factor-confirm-code" className="block text-sm font-semibold text-slate-900">Six-digit verification code</label>
            <input id="two-factor-confirm-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-xl tracking-[0.5em] text-slate-900" required />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button disabled={busy || code.length !== 6} className="btn-primary w-full">{busy ? "Verifying..." : "Enable two-factor authentication"}</button>
          </form>
        </>}
      </div>
    </div>
  );
}
