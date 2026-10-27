import { DatabaseCourse } from "@/hooks/useCourses";
import { getCurrentPortalUser } from "@/lib/portalData";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type EnrollmentRequestDialogProps = {
  course: DatabaseCourse | null;
  open: boolean;
  onClose: () => void;
};

export default function EnrollmentRequestDialog({
  course,
  open,
  onClose,
}: EnrollmentRequestDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [senderAccountTitle, setSenderAccountTitle] = useState("");
  const [senderAccountNumber, setSenderAccountNumber] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const user = getCurrentPortalUser();

  useEffect(() => {
    if (open) {
      setMessage("");
      setError("");
      setStudentPhone("");
      setTransferReference("");
      setSenderAccountTitle("");
      setSenderAccountNumber("");
      setReceipt(null);
    }
  }, [open, course?.id]);

  if (!open || !course) {
    return null;
  }

  const handleSubmit = async () => {
    setError("");
    setMessage("");

    if (!user || user.role !== "student") {
      setError("Please sign in with a student account before enrollment.");
      return;
    }

    if (!receipt) {
      setError("Upload your payment receipt to continue.");
      return;
    }
    if (receipt.size > 5 * 1024 * 1024) {
      setError("Receipt must be smaller than 5 MB.");
      return;
    }

    try {
      setIsSubmitting(true);
      const receiptDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Unable to read the receipt file."));
        reader.onerror = () => reject(new Error("Unable to read the receipt file."));
        reader.readAsDataURL(receipt);
      });
      const response = await fetch("/api/enrollment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.id,
          student_phone: studentPhone,
          transfer_reference: transferReference,
          sender_account_title: senderAccountTitle,
          sender_account_number: senderAccountNumber,
          receipt_data_url: receiptDataUrl,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to submit enrollment request.");
      }

      setMessage("Application submitted. An administrator will review it shortly.");
      window.dispatchEvent(new Event("edulearnx-data-change"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to submit enrollment request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
      <div className="mx-auto max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
          <div>
            <p className="text-sm font-semibold text-edu-purple">Enroll Now</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {course.title}
            </h2>
          </div>
          <button
            aria-label="Close enrollment form"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-6">
          {!user || user.role !== "student" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-semibold text-amber-900">
                Student account required
              </p>
              <p className="mt-2 text-sm text-amber-800">
                Sign in with a student account, then return to request enrollment.
              </p>
              <Link
                to="/signin"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-900 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Sign In <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Apply for <strong>{course.title}</strong> and upload your payment receipt.
                Your receipt is stored privately and can only be opened by an authorized administrator.
              </p>
              <div className="grid gap-1">
                <label className="text-sm font-semibold text-slate-700">Student name</label>
                <input value={user.name} readOnly className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-slate-600" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-semibold text-slate-700">Email</label>
                <input value={user.email} readOnly className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-slate-600" />
              </div>
              <div className="grid gap-1">
                <label htmlFor="enrollment-phone" className="text-sm font-semibold text-slate-700">Phone number</label>
                <input id="enrollment-phone" value={studentPhone} onChange={(event) => setStudentPhone(event.target.value)} required maxLength={64} className="rounded-xl border border-slate-300 px-4 py-3 text-slate-900" />
              </div>
              <div className="grid gap-1">
                <label htmlFor="sender-account-title" className="text-sm font-semibold text-slate-700">Name on sender account</label>
                <input id="sender-account-title" value={senderAccountTitle} onChange={(event) => setSenderAccountTitle(event.target.value)} required maxLength={255} className="rounded-xl border border-slate-300 px-4 py-3 text-slate-900" />
              </div>
              <div className="grid gap-1">
                <label htmlFor="sender-account-number" className="text-sm font-semibold text-slate-700">Sender account number</label>
                <input id="sender-account-number" value={senderAccountNumber} onChange={(event) => setSenderAccountNumber(event.target.value)} required maxLength={255} className="rounded-xl border border-slate-300 px-4 py-3 text-slate-900" />
              </div>
              <div className="grid gap-1">
                <label htmlFor="transfer-reference" className="text-sm font-semibold text-slate-700">Transfer reference (optional)</label>
                <input id="transfer-reference" value={transferReference} onChange={(event) => setTransferReference(event.target.value)} maxLength={255} className="rounded-xl border border-slate-300 px-4 py-3 text-slate-900" />
              </div>
              <div className="grid gap-1">
                <label htmlFor="payment-receipt" className="text-sm font-semibold text-slate-700">Payment receipt</label>
                <input id="payment-receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReceipt(event.target.files?.[0] || null)} required className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2" />
                <span className="text-xs text-slate-500">JPEG, PNG, WebP, or PDF; maximum 5 MB.</span>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          {message && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {message}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              Boolean(message) ||
              !user ||
              user.role !== "student" ||
              !studentPhone.trim() ||
              !senderAccountTitle.trim() ||
              !senderAccountNumber.trim() ||
              !receipt
            }
            className="btn-primary flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting application..." : "Submit Application"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
