import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";

const posts = [
  {
    title: "Learning Tips for Modern Students",
    summary: "Discover study habits and review strategies that help you stay ahead.",
    href: "/courses",
  },
  {
    title: "How to Choose the Right Online Course",
    summary: "A quick guide to matching your learning goals with the best course.",
    href: "/courses",
  },
  {
    title: "Maximizing Retention with Active Learning",
    summary: "Practical ways to remember what you learn and measure progress.",
    href: "/courses",
  },
];

export default function Blog() {
  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar />
      <section className="relative pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10">
            <h1 className="text-5xl font-bold text-slate-900 mb-4">EduLearnX Blog</h1>
            <p className="text-lg text-slate-600 max-w-3xl">
              Explore the latest learning tips, course highlights, and student success stories.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article key={post.title} className="rounded-3xl border border-slate-200 p-8 shadow-lg hover:border-edu-purple transition">
                <h2 className="text-2xl font-semibold text-slate-900 mb-3">{post.title}</h2>
                <p className="text-slate-600 mb-6">{post.summary}</p>
                <Link to={post.href} className="font-semibold text-edu-purple hover:text-edu-dark-blue">
                  Read more →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
