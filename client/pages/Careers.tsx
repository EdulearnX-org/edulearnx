import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";

const roles = [
  {
    title: "Course Designer",
    description: "Build immersive course experiences for learners across subjects.",
  },
  {
    title: "Student Success Coach",
    description: "Help learners stay motivated and reach their goals.",
  },
  {
    title: "Community Manager",
    description: "Support our growing learning community with engaging experiences.",
  },
];

export default function Careers() {
  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar />
      <section className="relative pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-5xl font-bold text-slate-900 mb-6">Careers at EduLearnX</h1>
          <p className="text-lg text-slate-600 max-w-3xl mb-10">
            Join a team that builds learning experiences for students and educators.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {roles.map((role) => (
              <div key={role.title} className="rounded-3xl border border-slate-200 p-8 shadow-lg">
                <h2 className="text-2xl font-semibold text-slate-900 mb-3">{role.title}</h2>
                <p className="text-slate-600 mb-6">{role.description}</p>
                <Link to="/contact" className="font-semibold text-edu-purple hover:text-edu-dark-blue">
                  Apply now →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
