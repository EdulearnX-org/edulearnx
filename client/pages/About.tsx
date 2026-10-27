import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";

export default function About() {
  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar />
      <section className="relative pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10 rounded-3xl border border-slate-200 bg-edu-light-blue/10 p-10 shadow-xl">
            <h1 className="text-5xl font-bold text-slate-900 mb-6">About EduLearnX</h1>
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              EduLearnX is a modern learning platform built for students and teachers who want high-quality courses, flexible pacing, and real-world guidance.
            </p>
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              Our mission is to make education engaging, accessible, and effective for everyone — from school learners to professionals leveling up their skills.
            </p>
            <Link to="/signup" className="btn-primary inline-flex items-center gap-2 px-6 py-3">
              Join Now
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
