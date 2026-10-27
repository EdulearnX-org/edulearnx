import Navbar from "@/components/Navbar";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  GraduationCap,
  FileBadge,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

export default function BecomeTutor() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [expertise, setExpertise] = useState("");
  const [experienceYears, setExperienceYears] = useState("0");
  const [certificates, setCertificates] = useState<string[]>(["", "", ""]);
  const [bio, setBio] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/tutor-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone,
          expertise,
          experience_years: Number(experienceYears),
          certificate_1: certificates[0],
          certificate_2: certificates[1],
          certificate_3: certificates[2],
          bio,
          password,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to submit tutor application.");
      }

      setMessage(
        "Application submitted. After admin approval, sign in with this email and password to open your teacher portal.",
      );
      setFullName("");
      setEmail("");
      setPhone("");
      setExpertise("");
      setExperienceYears("0");
      setCertificates(["", "", ""]);
      setBio("");
      setPassword("");
      window.dispatchEvent(new Event("edulearnx-data-change"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to submit tutor application.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-white">
      <Navbar />

      <section className="relative px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute top-24 -left-40 h-80 w-80 rounded-full bg-edu-purple/20 glow-blob" />
        <div
          className="absolute top-48 -right-40 h-80 w-80 rounded-full bg-edu-light-blue/20 glow-blob"
          style={{ animationDelay: "2s" }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-edu-purple/10 px-4 py-2 text-sm font-semibold text-edu-purple">
              <GraduationCap className="h-4 w-4" />
              Become a Tutor
            </div>
            <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
              Apply to teach on EduLearnX
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Submit your teaching profile for admin review. Approved tutors get
              access to the teacher portal for classes, uploads, attendance, and
              student management.
            </p>
            <div className="mt-8 grid gap-4">
              {[
                "Admin reviews your application",
                "Approved tutors receive teacher portal access",
                "Use your submitted email and password to sign in",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 sm:p-8">
            <form onSubmit={handleSubmit} className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Full name" icon={<UserRound className="h-5 w-5" />}>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="form-input"
                    autoComplete="name"
                    required
                  />
                </Field>

                <Field label="Email" icon={<Mail className="h-5 w-5" />}>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value.toLowerCase())}
                    className="form-input"
                    autoComplete="email"
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Phone" icon={<Phone className="h-5 w-5" />}>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="form-input"
                    autoComplete="tel"
                  />
                </Field>

                <Field label="Teacher portal password" icon={<LockKeyhole className="h-5 w-5" />}>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="form-input"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-5 md:grid-cols-[1fr_160px]">
                <Field label="Subject expertise" icon={<BriefcaseBusiness className="h-5 w-5" />}>
                  <input
                    value={expertise}
                    onChange={(event) => setExpertise(event.target.value)}
                    placeholder="English, coding, IELTS, science"
                    className="form-input"
                    required
                  />
                </Field>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                    Experience
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={experienceYears}
                    onChange={(event) => setExperienceYears(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-900 outline-none transition focus:border-edu-purple focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><FileBadge className="h-5 w-5 text-edu-purple" /> Three teaching certificates</div>
                <p className="mb-3 text-sm text-slate-500">Upload up to three PDF, JPG, or PNG certificates (5 MB each).</p>
                <div className="grid gap-3">
                  {certificates.map((certificate, index) => (
                    <label key={index} className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 hover:border-edu-purple">
                      <FileBadge className="h-5 w-5 shrink-0 text-edu-purple" />
                      <span className="min-w-0 flex-1 truncate">{certificate ? `Certificate ${index + 1} attached` : `Choose certificate ${index + 1}`}</span>
                      <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) { setError("Each certificate must be 5 MB or smaller."); return; }
                        const reader = new FileReader();
                        reader.onload = () => setCertificates((current) => current.map((value, itemIndex) => itemIndex === index ? String(reader.result) : value));
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Teaching bio
                </label>
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={5}
                  minLength={20}
                  placeholder="Share your teaching background, student level, and course ideas."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-900 outline-none transition focus:border-edu-purple focus:bg-white"
                  required
                />
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </p>
              )}

              {message && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : "Submit Application"}
                <ArrowRight size={18} />
              </button>
            </form>

            <p className="mt-6 border-t border-slate-200 pt-6 text-sm text-slate-600">
              Already approved?{" "}
              <Link
                to="/signin"
                className="font-semibold text-edu-dark-blue hover:text-edu-purple"
              >
                Sign in to your teacher portal
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-900">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
