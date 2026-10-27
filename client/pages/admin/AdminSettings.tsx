import {
  getCurrentPortalUser,
  requestPasswordReset,
  updateCurrentPortalUser,
} from "@/lib/portalData";
import { FormEvent, useEffect, useState } from "react";
import { Banknote, KeyRound, Save, User } from "lucide-react";
import {
  ADMIN_FEATURES,
  isPrimaryAdmin,
  normalizeAdminPermissions,
  type AdminFeature,
  type AdminPermissions,
} from "../../../shared/adminPermissions";
import AdminShell from "./AdminShell";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-white";

type CoAdmin = {
  id: number;
  email: string;
  full_name: string;
  permissions: AdminPermissions;
};

type PaymentSettings = {
  bank_name: string;
  account_name: string;
  account_number: string;
  iban: string;
  routing_code: string;
  instructions: string;
};

const emptyPaymentSettings: PaymentSettings = {
  bank_name: "",
  account_name: "",
  account_number: "",
  iban: "",
  routing_code: "",
  instructions: "",
};

export default function AdminSettings() {
  const currentUser = getCurrentPortalUser();
  const [name, setName] = useState(currentUser?.name ?? "");
  const [nameStatus, setNameStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false);
  const [coAdmins, setCoAdmins] = useState<CoAdmin[]>([]);
  const [permissionsStatus, setPermissionsStatus] = useState("");
  const [savingCoAdminId, setSavingCoAdminId] = useState<number | null>(null);
  const [paymentSettings, setPaymentSettings] = useState(emptyPaymentSettings);
  const [paymentStatus, setPaymentStatus] = useState("");
  useEffect(() => {
    if (!isPrimaryAdmin(currentUser?.email ?? "")) return;

    let isMounted = true;
    fetch("/api/admin/co-admins")
      .then((response) => response.json())
      .then((payload) => {
        if (!isMounted) return;
        if (!payload.success) {
          setPermissionsStatus(payload.error || "Unable to load co-admins.");
          return;
        }
        setCoAdmins(
          (payload.data ?? []).map((admin: CoAdmin) => ({
            ...admin,
            permissions: normalizeAdminPermissions(admin.permissions),
          })),
        );
      })
      .catch(() => {
        if (isMounted) setPermissionsStatus("Unable to load co-admins.");
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.email]);

  useEffect(() => {
    fetch("/api/payment-settings")
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success && payload.data) setPaymentSettings(payload.data);
      })
      .catch(() => setPaymentStatus("Unable to load bank details."));
  }, []);

  const savePaymentSettings = async (event: FormEvent) => {
    event.preventDefault();
    setPaymentStatus("");
    const response = await fetch("/api/payment-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paymentSettings),
    });
    const payload = await response.json();
    setPaymentStatus(response.ok && payload.success ? "Bank details saved." : payload.error || "Unable to save bank details.");
  };

  const updateCoAdminPermission = async (
    admin: CoAdmin,
    feature: AdminFeature,
    enabled: boolean,
  ) => {
    setSavingCoAdminId(admin.id);
    setPermissionsStatus("");
    const permissions = { ...admin.permissions, [feature]: enabled };

    try {
      const response = await fetch(`/api/admin/co-admins/${admin.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setPermissionsStatus(payload.error || "Unable to update co-admin access.");
        return;
      }

      setCoAdmins((current) =>
        current.map((item) =>
          item.id === admin.id ? { ...item, permissions: payload.data.permissions } : item,
        ),
      );
      setPermissionsStatus(`Updated access for ${admin.email}.`);
    } catch {
      setPermissionsStatus("Unable to update co-admin access.");
    } finally {
      setSavingCoAdminId(null);
    }
  };

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    setNameStatus("");

    if (!currentUser?.id || !name.trim()) {
      setNameStatus("Enter a valid account name.");
      return;
    }

    const response = await fetch(`/api/users/${currentUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name.trim() }),
    });
    const payload = await response.json();

    if (!response.ok || !payload.success || !payload.data) {
      setNameStatus(payload.error || "Unable to save account name.");
      return;
    }

    updateCurrentPortalUser({ name: payload.data.full_name });
    setNameStatus("Account name saved.");
  };

  const sendPasswordReset = async () => {
    setPasswordStatus("");
    if (!currentUser?.email) {
      setPasswordStatus("Admin account not found.");
      return;
    }
    setSendingPasswordReset(true);
    try {
      const payload = await requestPasswordReset(currentUser.email);
      setPasswordStatus(payload.message || "If an active account exists, a password reset email has been sent.");
    } catch (error) {
      setPasswordStatus(error instanceof Error ? error.message : "Unable to send password reset email.");
    } finally {
      setSendingPasswordReset(false);
    }
  };

  return (
    <AdminShell title="Settings" subtitle="Manage account settings.">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">
            Settings
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Edit your admin account name and request a password reset.
          </p>
        </header>

        <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <Banknote className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">Manual payment bank details</h2>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Students see these details before uploading payment proof.</p>
            </div>
          </div>
          <form onSubmit={savePaymentSettings} className="mt-5 grid gap-3 md:grid-cols-2">
            {(["bank_name", "account_name", "account_number", "iban", "routing_code"] as const).map((field) => (
              <input key={field} value={paymentSettings[field]} onChange={(event) => setPaymentSettings({ ...paymentSettings, [field]: event.target.value })} placeholder={field.replace(/_/g, " ")} className={inputClass} />
            ))}
            <textarea value={paymentSettings.instructions} onChange={(event) => setPaymentSettings({ ...paymentSettings, instructions: event.target.value })} placeholder="Transfer instructions" rows={4} className={`${inputClass} md:col-span-2`} />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-950"><Save className="h-4 w-4" /> Save bank details</button>
          </form>
          {paymentStatus && <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">{paymentStatus}</p>}
        </section>

        <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <User className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">
                Account name
              </h2>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                This name appears in your portal account.
              </p>
            </div>
          </div>

          <form onSubmit={saveName} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Account name"
              className={inputClass}
            />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              <Save className="h-4 w-4" /> Save Name
            </button>
          </form>
          {nameStatus && (
            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
              {nameStatus}
            </p>
          )}
        </section>

        {isPrimaryAdmin(currentUser?.email ?? "") && (
          <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">
                Co-admin access
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                Choose which admin areas each co-admin can manage.
              </p>
            </div>

            <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
              {coAdmins.map((admin) => (
                <div key={admin.id} className="py-4 first:pt-0 last:pb-0">
                  <h3 className="font-semibold text-slate-950 dark:text-white">
                    {admin.full_name}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {admin.email}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {ADMIN_FEATURES.map((feature) => (
                      <label
                        key={feature.key}
                        className="flex items-center gap-3 text-sm font-medium text-slate-800 dark:text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={admin.permissions[feature.key]}
                          disabled={savingCoAdminId === admin.id}
                          aria-label={`${feature.label} for ${admin.email}`}
                          onChange={(event) =>
                            updateCoAdminPermission(
                              admin,
                              feature.key,
                              event.target.checked,
                            )
                          }
                          className="h-4 w-4 accent-slate-950"
                        />
                        {feature.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {coAdmins.length === 0 && (
                <p className="py-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                  No co-admin accounts found.
                </p>
              )}
            </div>
            {permissionsStatus && (
              <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-200" role="status">
                {permissionsStatus}
              </p>
            )}
          </section>
        )}

        <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">
                Admin password
              </h2>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Send a secure password reset link to {currentUser?.email}.
              </p>
            </div>
          </div>

          <button type="button" onClick={sendPasswordReset} disabled={sendingPasswordReset} className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
            <KeyRound className="h-4 w-4" /> {sendingPasswordReset ? "Sending..." : "Send password reset email"}
          </button>
          {passwordStatus && (
            <p role="status" className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
              {passwordStatus}
            </p>
          )}
        </section>

      </div>
    </AdminShell>
  );
}
