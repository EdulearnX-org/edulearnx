import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { usePortalAuth } from "@/lib/portalData";
import { readApiResponse } from "@/lib/api";
import EduLearnXLogo from "@/components/EduLearnXLogo";

type SetupPayload = { secret: string; otpauth_url: string; issuer: string; account: string };

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
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const qrCodeDataUrl = useMemo(() => {
    if (!setup?.otpauth_url) return "";
    try {
      const qr = qrcode(0, "M");
      qr.addData(setup.otpauth_url);
      qr.make();
      return qr.createDataURL(5, 4);
    } catch {
      return "";
    }
  }, [setup?.otpauth_url]);

  useEffect(() => {
    // A dismissed reminder stays hidden only for this signed-in session.
    // Signing out/in resets it, so it appears again until 2FA is enabled.
    setSetup(null);
    setCode("");
    setError("");
    setClosed(false);
  }, [user?.id, user?.two_factor_enabled]);

  const start = async () => {
    setBusy(true); setError("");
    try { setSetup(await request("setup", {}) as SetupPayload); setCode(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to start setup."); }
    finally { setBusy(false); }
  };
  const confirm = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await request("confirm", { code });
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to verify code."); }
    finally { setBusy(false); }
  };
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(setup!.secret);
      setError("");
    } catch {
      setError("Clipboard access is unavailable. You can still type the setup key manually.");
    }
  };

  if (!user || user.two_factor_enabled || closed) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="two-factor-title">
      <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
        <button type="button" onClick={() => setClosed(true)} aria-label="Close security reminder" title="Close reminder" className="absolute right-4 top-4 rounded-full p-2 text-xl leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">×</button>
        <div className="mb-5 flex justify-center"><EduLearnXLogo /></div>
        {!setup ? <>
          <h2 id="two-factor-title" className="text-2xl font-bold text-slate-900">Protect your EduLearnX account</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Add a second sign-in step using any authenticator app that supports time-based one-time passwords (TOTP). This works with Google Authenticator, Microsoft Authenticator and other compatible apps.</p>
          <div className="mt-5 rounded-xl border border-edu-purple/20 bg-edu-purple/10 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">A quick security reminder</p>
            <p className="mt-1">You can set up an authenticator now, or close this reminder and continue to your portal. If you close it, we will show it again the next time you sign in until two-factor authentication is enabled.</p>
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button disabled={busy} onClick={start} className="btn-primary mt-6 w-full">{busy ? "Preparing secure setup..." : "Set up authenticator"}</button>
        </> : <>
          <h2 id="two-factor-title" className="text-2xl font-bold text-slate-900">Connect an authenticator app</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">This QR code is generated on this device by EduLearnX. Your setup secret is not sent to a QR-code website or third-party service.</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>Install or open an authenticator app on your phone that supports TOTP.</li>
            <li>Tap <strong>Add account</strong> or the <strong>+</strong> button, then choose <strong>Scan a QR code</strong>.</li>
            <li>Scan the QR code below. The app should add an account labelled EduLearnX.</li>
            <li>Enter the current six-digit code from the app below to confirm the setup.</li>
          </ol>
          <div className="mt-5 flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-4">
            {qrCodeDataUrl ? (
              <img src={qrCodeDataUrl} alt="EduLearnX authenticator setup QR code" width="230" height="230" className="h-[230px] w-[230px] rounded-lg bg-white p-2" />
            ) : (
              <p role="alert" className="text-sm font-semibold text-red-700">The QR code could not be generated. Use the manual setup key below.</p>
            )}
            <p className="mt-2 break-all text-center text-sm font-semibold text-slate-900">EduLearnX · {setup.account}</p>
          </div>
          <details className="mt-4 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Can't scan? Enter setup key manually</summary>
            <p className="mt-3 text-xs leading-5 text-slate-600">In your authenticator app, choose manual setup and enter this key. Select time-based (TOTP) if the app asks.</p>
            <p className="mt-3 break-all font-mono text-base font-bold tracking-wider text-slate-900">{setup.secret}</p>
            <button type="button" onClick={() => void copySecret()} className="mt-2 text-sm font-semibold text-edu-dark-blue hover:underline">Copy setup key</button>
          </details>
          <form onSubmit={confirm} className="mt-5 space-y-3">
            <label htmlFor="two-factor-confirm-code" className="block text-sm font-semibold text-slate-900">Enter the six-digit code from your app</label>
            <input id="two-factor-confirm-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-xl tracking-[0.5em] text-slate-900" required />
            <p className="text-xs leading-5 text-slate-500">You scan this QR code only once during setup. At each future sign-in, enter the current code from your app. Codes refresh about every 30 seconds.</p>
            <p className="text-xs leading-5 text-slate-500">After you enable it, EduLearnX signs you out once. Sign in again with your password and the authenticator code.</p>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={busy || code.length !== 6} className="btn-primary w-full">{busy ? "Checking code..." : "Enable two-factor authentication"}</button>
            <button type="button" disabled={busy} onClick={() => { setSetup(null); setCode(""); setError(""); }} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">Back</button>
          </form>
        </>}
      </div>
    </div>
  );
}
