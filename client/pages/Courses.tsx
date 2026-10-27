import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Reveal from "@/components/Reveal";
import { courseDateRange, courseDuration, useCourses } from "@/hooks/useCourses";
import { useStudentEnrollments } from "@/hooks/useStudentEnrollments";
import { getCurrentPortalUser } from "@/lib/portalData";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Search } from "lucide-react";

export default function Courses() {
  const { courses, isLoading, error } = useCourses();
  const currentUser = getCurrentPortalUser();
  const studentId = currentUser?.role === "student" ? currentUser.id : undefined;
  const { enrollments } = useStudentEnrollments(studentId);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (course.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "All" || course.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const categories = [
    "All",
    ...Array.from(
      new Set(
        courses
          .map((course) => course.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ),
  ];
  const enrolledCourseIds = new Set(
    enrollments.map((enrollment) => enrollment.course_id),
  );

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar />

      <section className="relative pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="absolute top-20 -left-40 w-80 h-80 bg-edu-purple/20 rounded-full glow-blob"></div>
        <div
          className="absolute top-40 -right-40 w-80 h-80 bg-edu-light-blue/20 rounded-full glow-blob"
          style={{ animationDelay: "2s" }}
        ></div>

        <div className="max-w-7xl mx-auto relative z-10 text-center mb-12">
          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 mb-4">
            Our Courses
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Explore professional online courses designed to help students learn
            and grow.
          </p>
        </div>

        <div className="max-w-4xl mx-auto relative z-10 mb-12">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-4 rounded-full border-2 border-slate-200 focus:border-edu-purple focus:outline-none text-lg transition-colors bg-white/50 backdrop-blur"
            />
          </div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-6 py-2 rounded-full font-semibold transition-all duration-300 ${
                  selectedCategory === category
                    ? "bg-gradient-to-r from-edu-dark-blue to-edu-light-blue text-white shadow-lg"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
              Loading courses from database...
            </p>
          ) : error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredCourses.map((course, idx) => (
                <Reveal
                  key={course.id}
                  className="group course-card flex h-full flex-col"
                  delay={idx * 90}
                >
                  {course.thumbnail_url ? (
                    <div className="overflow-hidden">
                      <img
                        src={course.thumbnail_url}
                        alt={`${course.title} course`}
                        className="course-image group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center bg-slate-100 text-slate-400">
                      <BookOpen className="h-12 w-12" />
                    </div>
                  )}

                  <div className="flex flex-grow flex-col p-8">
                    {course.category && (
                      <div className="mb-4 inline-flex w-fit rounded-full bg-edu-purple/10 px-3 py-1 text-xs font-semibold text-edu-purple">
                        {course.category}
                      </div>
                    )}
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">
                      {course.title}
                    </h3>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      {course.description}
                    </p>

                    <div className="space-y-2 mb-6 flex-grow">
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-slate-500">Teacher:</span>
                        <span className="text-right text-edu-purple font-semibold">
                          {course.instructor_name || "Not assigned"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-slate-500">Duration:</span>
                        <span className="text-right text-edu-dark-blue font-semibold">
                          {courseDuration(course)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-slate-500">Course dates:</span>
                        <span className="text-right text-edu-dark-blue font-semibold">
                          {courseDateRange(course)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-slate-500">Students:</span>
                        <span className="text-right text-edu-dark-blue font-semibold">
                          {course.enrollment_count}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {enrolledCourseIds.has(course.id) ? (
                        <Link
                          to="/student/courses"
                          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 font-semibold text-white transition hover:bg-emerald-700"
                        >
                          <CheckCircle2 size={16} /> Open Course
                        </Link>
                      ) : (
                        <Link
                          to={`/checkout/${course.id}`}
                          className="btn-primary w-full flex items-center justify-center gap-2 group-hover:shadow-xl"
                        >
                          Enroll Now <ArrowRight size={16} />
                        </Link>
                      )}
                      <Link
                        to={`/course/${course.id}`}
                        className="btn-outline-primary w-full flex items-center justify-center gap-2"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal className="text-center py-20">
              <Search className="mx-auto mb-4 h-14 w-14 text-edu-purple" />
              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                No courses found in the database
              </h3>
              <p className="text-slate-600">
                Try adjusting your search or filter criteria
              </p>
            </Reveal>
          )}

          <div className="mt-12 text-center">
            <p className="text-slate-600">
              Showing{" "}
              <span className="font-semibold text-edu-dark-blue">
                {filteredCourses.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-edu-dark-blue">
                {courses.length}
              </span>{" "}
              courses
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <Reveal className="bg-gradient-to-r from-edu-dark-blue via-edu-purple to-edu-light-blue p-12 rounded-3xl text-white text-center">
            <h2 className="text-4xl font-bold mb-4">
              Ready to Start Learning?
            </h2>
            <p className="text-lg text-white/90 mb-8">
              Create your student account and add courses to your portal.
            </p>
            <Link
              to="/signup"
              className="inline-flex px-8 py-3 rounded-full font-semibold bg-white text-edu-dark-blue hover:shadow-lg transition-all duration-300 hover:scale-105"
            >
              Get Started Today
            </Link>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}
