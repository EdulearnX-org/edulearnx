import Navbar from "@/components/Navbar";
import EduLearnXLogo from "@/components/EduLearnXLogo";
import { Mail, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function Contact() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to send your message.");
      setResult({ success: true, message: "Your message has been received. Thank you for contacting us." });
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : "Unable to send your message. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar />

      {/* Page Header */}
      <section className="relative pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        {/* Background blobs */}
        <div className="absolute top-20 -left-40 w-80 h-80 bg-edu-purple/20 rounded-full glow-blob"></div>
        <div className="absolute top-40 -right-40 w-80 h-80 bg-edu-light-blue/20 rounded-full glow-blob" style={{ animationDelay: "2s" }}></div>

        <div className="max-w-7xl mx-auto relative z-10 text-center">
          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 mb-4">
            Get in Touch
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Have questions? We'd love to hear from you. Contact our support team
            or reach out directly.
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 gap-8 mb-16">
            {/* Contact Info Cards */}
            {[
              {
                icon: Mail,
                title: "Email",
                content: "team@edulearnx.org",
                description: "We respond as soon as possible",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="feature-card text-center hover:shadow-xl"
              >
                <div className="bg-gradient-to-r from-edu-dark-blue to-edu-light-blue p-4 rounded-xl w-fit mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-lg font-semibold text-edu-purple mb-1">
                  {item.content}
                </p>
                <p className="text-slate-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>

          {/* Contact Form */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-lg">
              <h2 className="text-3xl font-bold text-slate-900 mb-8">
                Send us a Message
              </h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      maxLength={200}
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="John Doe"
                      required
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-edu-purple focus:outline-none transition-colors bg-slate-50"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      name="email"
                      maxLength={320}
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="Enter your email"
                      required
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-edu-purple focus:outline-none transition-colors bg-slate-50"
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Subject
                  </label>
                  <select
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-edu-purple focus:outline-none transition-colors bg-slate-50"
                  >
                    <option value="">Select a subject...</option>
                    <option value="general">General Inquiry</option>
                    <option value="course">Course Question</option>
                    <option value="enrollment">Enrollment Support</option>
                    <option value="technical">Technical Issue</option>
                    <option value="partnership">Partnership Opportunity</option>
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Message
                  </label>
                  <textarea
                    name="message"
                    maxLength={10000}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us more about your inquiry..."
                    rows={5}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-edu-purple focus:outline-none transition-colors bg-slate-50 resize-none"
                  ></textarea>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-lg"
                >
                  {submitting ? "Sending…" : "Send Message"} <ArrowRight size={20} />
                </button>
                {result && <p role={result.success ? "status" : "alert"} className={result.success ? "text-green-700" : "text-red-700"}>{result.message}</p>}
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {[
              {
                q: "What courses do you offer?",
                a: "We offer courses in Spoken English, IELTS Preparation, Coding for Kids, Biology, Chemistry, and Mathematics.",
              },
              {
                q: "How do I enroll in a course?",
                a: "Visit the Courses page, select Enroll Now, submit your request, and wait for admin approval.",
              },
              {
                q: "Is there a free trial?",
                a: "Yes! Join our free demo sessions to experience our teaching style before committing to a full course.",
              },
            ].map((faq, idx) => (
              <details
                key={idx}
                className="group border border-slate-200 rounded-lg p-6 cursor-pointer hover:border-edu-purple/30 transition-colors"
              >
                <summary className="flex items-center justify-between font-bold text-slate-900 group-open:text-edu-purple transition-colors">
                  {faq.q}
                  <span className="group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>
                <p className="text-slate-600 mt-4">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-edu-dark-blue via-edu-purple to-edu-light-blue p-12 rounded-3xl text-white text-center">
            <h2 className="text-4xl font-bold mb-4">
              Still have questions?
            </h2>
            <p className="text-lg text-white/90 mb-8">
              Schedule a free consultation with our team
            </p>
            <button className="px-8 py-3 rounded-full font-semibold bg-white text-edu-dark-blue hover:shadow-lg transition-all duration-300 hover:scale-105">
              Book a Demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="mb-4">
                <EduLearnXLogo compact />
              </div>
              <p className="text-slate-400 text-sm">
                Empowering learners worldwide with quality education.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Courses</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="/courses" className="hover:text-white transition">
                    All Courses
                  </a>
                </li>
                <li>
                  <a href="/courses" className="hover:text-white transition">
                    Languages
                  </a>
                </li>
                <li>
                  <a href="/courses" className="hover:text-white transition">
                    Sciences
                  </a>
                </li>
                <li>
                  <a href="/courses" className="hover:text-white transition">
                    Technology
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="/" className="hover:text-white transition">
                    About
                  </a>
                </li>
                <li>
                  <a href="/" className="hover:text-white transition">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="/contact" className="hover:text-white transition">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="/" className="hover:text-white transition">
                    Careers
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a
                    href="mailto:team@edulearnx.org"
                    className="hover:text-white transition"
                  >
                    team@edulearnx.org
                  </a>
                </li>
                <li className="mt-4">
                  <div className="flex gap-4">
                    <a href="#" className="hover:text-white transition">
                      Twitter
                    </a>
                    <a href="#" className="hover:text-white transition">
                      LinkedIn
                    </a>
                    <a href="#" className="hover:text-white transition">
                      Facebook
                    </a>
                  </div>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8">
            <p className="text-sm text-slate-400 text-center">
              © 2026 EduLearnX. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
