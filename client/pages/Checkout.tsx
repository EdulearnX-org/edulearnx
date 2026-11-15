import { uploadPrivateFile, type UploadReference } from "@/lib/uploads";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { readApiResponse } from "@/lib/api";
import { useCurrentUser } from "@/lib/user";
import { ArrowLeft, CheckCircle2, Upload } from "lucide-react";

type Course = { id: number; title: string; description: string | null; price_cents: number };
type PaymentSettings = { bank_name: string; account_name: string; account_number: string; iban: string; routing_code: string; instructions: string };
const emptySettings: PaymentSettings = { bank_name: "", account_name: "", account_number: "", iban: "", routing_code: "", instructions: "" };
const maxReceiptSize = 5 * 1024 * 1024;
const allowedReceiptTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Checkout() {
  const { courseId } = useParams<{ courseId: string }>();
  const user = useCurrentUser();
  const [studentPhone, setStudentPhone] = useState(user?.phone ?? "");
  const [senderAccountTitle, setSenderAccountTitle] = useState("");
  const [senderAccountNumber, setSenderAccountNumber] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const uploadedReceipt = useRef<UploadReference | null>(null);
  const submitting = useRef(false);
  const [applicationId,setApplicationId]=useState("");
  const [receiptName, setReceiptName] = useState("");
  const [receiptSize, setReceiptSize] = useState<number | null>(null);
  const isReadingReceipt=false;
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { data: course, isLoading, error: courseError } = useQuery({
    queryKey: ["course", courseId, user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}`);
      const payload = await readApiResponse(response);
      if (!response.ok || !payload.success) throw new Error(payload.error || "Course not found");
      return payload.data as Course;
    },
    enabled: Boolean(courseId),
  });

  const { data: settings = emptySettings, isPending: settingsLoading, error: settingsError, refetch: reloadSettings } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const response = await fetch("/api/payment-settings");
      const payload = await readApiResponse(response);
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error("Unable to load payment details. Please try again.");
      }
      return payload.data as PaymentSettings;
    },
    retry: false,
  });

  const readReceipt = (event: ChangeEvent<HTMLInputElement>) => {
    setReceipt(null);uploadedReceipt.current=null;setReceiptName("");setReceiptSize(null);setError("");
    const file=event.target.files?.[0];
    if(!file) return;
    if(!allowedReceiptTypes.has(file.type) || !file.size || file.size>maxReceiptSize) {setError("Choose a JPEG, PNG, WebP, or PDF file between 1 byte and 5 MB.");return;}
    setReceipt(file);setReceiptName(file.name);setReceiptSize(file.size);
  };

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage("");
    if (submitting.current || message) return;
    if (!user || user.role !== "student") { setError("Please sign in with a student account before submitting payment proof."); return; }
    if (!receipt || !studentPhone.trim() || !senderAccountTitle.trim() || !senderAccountNumber.trim()) {
      setError("Enter your phone number, sender account title and number, and upload your receipt.");
      return;
    }
    submitting.current=true;
    setIsSubmitting(true);
    setUploadProgress({ loaded: 0, total: 0 });
    try {
      uploadedReceipt.current ||= await uploadPrivateFile(receipt,'receipt',setUploadProgress);
      const response=await fetch('/api/enrollment-requests',{method:'POST',signal:AbortSignal.timeout(60_000),headers:{'Content-Type':'application/json'},body:JSON.stringify({course_id:course?.id,student_phone:studentPhone.trim(),sender_account_title:senderAccountTitle.trim(),sender_account_number:senderAccountNumber.trim(),receipt:uploadedReceipt.current})});
      const payload=await readApiResponse(response);
      if(!response.ok || !payload.success) throw new Error(payload.error||'Unable to submit payment proof.');
      setApplicationId(payload.data.id);
      setMessage("Payment proof submitted. An admin will review it before enrollment is granted.");
      window.dispatchEvent(new Event("edulearnx-data-change"));
    } catch (submissionError) {
      setUploadProgress(null);
      setError(submissionError instanceof Error ? submissionError.message : "Unable to submit payment proof.");
    }
    finally { submitting.current=false;setIsSubmitting(false); }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading course...</div>;
  if (courseError || !course) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-white"><p role="alert">{courseError instanceof Error ? courseError.message : "Course not found."}</p><Link to="/courses" className="font-semibold text-cyan-300">Back to courses</Link></main>;
  const amount = (course.price_cents / 100).toFixed(2);
  const bankRows = [["Bank", settings.bank_name], ["Account name", settings.account_name], ["Account number", settings.account_number], ["IBAN", settings.iban], ["Routing code", settings.routing_code]].filter(([, value]) => value);

  return <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6"><div className="mx-auto max-w-5xl">
    <Link to={`/course/${course.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to course</Link>
    <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-2xl border border-white/10 bg-slate-900 p-6"><p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">Manual payment</p><h1 className="mt-3 text-3xl font-bold">{course.title}</h1><p className="mt-4 text-slate-300">{course.description || "Transfer the course fee and submit proof for admin approval."}</p><p className="mt-8 text-sm text-slate-400">Amount to transfer</p><p className="mt-1 text-4xl font-bold">${amount}</p><div className="mt-8 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4"><p className="font-semibold text-cyan-100">Enrollment is approved manually</p><p className="mt-2 text-sm leading-6 text-cyan-50/80">Your course access begins only after an admin verifies the transfer receipt.</p></div></section>
      <section className="rounded-2xl border border-white/10 bg-white p-6 text-slate-950">
        <h2 className="text-2xl font-bold">Transfer details</h2>
        {settingsLoading ? <p role="status" className="mt-5 text-sm text-slate-600">Loading payment details...</p> : settingsError ? (
          <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <p>Unable to load payment details.</p>
            <button type="button" onClick={() => void reloadSettings()} className="mt-2 font-bold underline">Try again</button>
          </div>
        ) : bankRows.length > 0 ? <dl className="mt-5 divide-y divide-slate-200 rounded-xl border border-slate-200">{bankRows.map(([label, value]) => <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr]"><dt className="text-sm font-semibold text-slate-500">{label}</dt><dd className="break-words text-sm font-bold">{value}</dd></div>)}</dl> : <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Bank details have not been configured yet. Please contact an administrator.</p>}
        {!settingsError && settings.instructions && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-100 p-4 text-sm leading-6 text-slate-700">{settings.instructions}</p>}
        {!user ? (
          <p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
            <Link to="/signin" state={{ redirectTo: `/checkout/${course.id}` }} className="font-bold underline">Sign in to submit payment proof</Link>. You will return to this course after signing in.
          </p>
        ) : user.role !== "student" ? <p role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Use a student account to submit payment proof.</p> : null}
        <form onSubmit={submitRequest} aria-busy={isSubmitting} className="mt-6 space-y-4">
          <fieldset disabled={isSubmitting || Boolean(message) || user?.role !== "student"} className="min-w-0 space-y-4">
          <label className="block text-sm font-semibold">Your phone number<input required type="tel" autoComplete="tel" maxLength={20} value={studentPhone} onChange={(event) => setStudentPhone(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal outline-none focus:border-slate-950" placeholder="Phone number for your enrollment application" /></label>
          <label className="block text-sm font-semibold">Your account title<input required maxLength={255} value={senderAccountTitle} onChange={(event) => setSenderAccountTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal outline-none focus:border-slate-950" placeholder="Name registered to the sending account" /></label>
          <label className="block text-sm font-semibold">Your account number<input required maxLength={255} value={senderAccountNumber} onChange={(event) => setSenderAccountNumber(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal outline-none focus:border-slate-950" placeholder="Account used to make the transfer" /></label>
          <label className="block text-sm font-semibold">Payment receipt<input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={readReceipt} className="mt-2 block w-full rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm font-normal" /><span className="mt-2 flex items-center gap-2 text-xs font-normal text-slate-500"><Upload className="h-4 w-4" />{receiptName || "JPEG, PNG, WebP, or PDF up to 5 MB"}</span>{receiptSize !== null && <span className="mt-1 block text-xs font-normal text-slate-500">Selected file size: {formatFileSize(receiptSize)}</span>}</label>
          {uploadProgress && <div aria-live="polite" className="space-y-2"><div className="flex justify-between text-xs font-medium text-slate-600"><span>{isSubmitting ? "Uploading receipt and payment details" : "Upload complete"}</span><span>{uploadProgress.total ? `${Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%` : "Preparing upload..."}</span></div><progress aria-label="Payment proof upload progress" max={uploadProgress.total || 1} value={uploadProgress.total ? Math.min(uploadProgress.loaded, uploadProgress.total) : undefined} className="h-2 w-full accent-slate-950" />{uploadProgress.total > 0 && <p className="text-right text-xs text-slate-500">{formatFileSize(Math.min(uploadProgress.loaded, uploadProgress.total))} of {formatFileSize(uploadProgress.total)} sent</p>}</div>}
          {isReadingReceipt && <p role="status" className="text-sm text-slate-600">Reading receipt...</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          {applicationId && <Link className="block text-cyan-300 underline" to={`/payment-success?application_id=${encodeURIComponent(applicationId)}`}>View application status</Link>}{message && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</p>}
          <button disabled={isSubmitting || Boolean(message) || isReadingReceipt || !receipt || settingsLoading || Boolean(settingsError) || !user || user.role !== "student"} className="w-full rounded-lg bg-slate-950 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Submitting proof..." : "Submit payment proof"}</button>
          </fieldset>
        </form>
      </section>
    </div>
  </div></main>;
}
