import "./global.css";

import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense, useEffect } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedPortal from "./components/ProtectedPortal";
import { startKeepAliveService, stopKeepAliveService } from "./lib/keepAlive";
import { initializePortalAuth, usePortalAuth } from "./lib/portalData";

const Index = lazy(() => import("./pages/Index"));
const Courses = lazy(() => import("./pages/Courses"));
const CourseDetail = lazy(() => import("./pages/CourseDetail"));
const Contact = lazy(() => import("./pages/Contact"));
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const Careers = lazy(() => import("./pages/Careers"));
const BecomeTutor = lazy(() => import("./pages/BecomeTutor"));
const Checkout = lazy(() => import("./pages/Checkout"));
const CheckoutReturn = lazy(() => import("./pages/CheckoutReturn"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const AdminDashboard = lazy(() => import("./pages/dashboards/AdminDashboard"));
const TeacherDashboard = lazy(() => import("./pages/dashboards/TeacherDashboard"));
const StudentDashboard = lazy(() => import("./pages/dashboards/StudentDashboard"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminCourses = lazy(() => import("./pages/admin/AdminCourses"));
const AdminEnrollmentRequests = lazy(() => import("./pages/admin/AdminEnrollmentRequests"));
const AdminTutorApplications = lazy(() => import("./pages/admin/AdminTutorApplications"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminDeals = lazy(() => import("./pages/admin/AdminDeals"));
const AdminLiveClasses = lazy(() => import("./pages/admin/AdminLiveClasses"));
const StudentLiveClasses = lazy(() => import("./pages/StudentLiveClasses"));
const LiveClassRoom = lazy(() => import("./pages/LiveClassRoom"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => {
  const { isLoading: authLoading } = usePortalAuth();
  useEffect(() => {
    startKeepAliveService();
    void initializePortalAuth().catch((error) => {
      console.error("Unable to restore account session:", error);
    });

    return () => {
      stopKeepAliveService();
    };
  }, []);

  if (authLoading) {
    return <div role="status" className="flex min-h-screen items-center justify-center">Restoring your account session...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense
              fallback={
                <div
                  className="flex min-h-screen items-center justify-center"
                  role="status"
                  aria-live="polite"
                >
                  Loading page...
                </div>
              }
            >
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/course/:id" element={<CourseDetail />} />
              <Route path="/courses/:id" element={<CourseDetail />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/refund" element={<RefundPolicy />} />
              <Route path="/about" element={<About />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/careers" element={<Careers />} />
              <Route path="/become-tutor" element={<BecomeTutor />} />
              <Route path="/checkout/:courseId" element={<Checkout />} />
              <Route path="/checkout/return" element={<CheckoutReturn />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />

              <Route
                path="/admin"
                element={
                  <ProtectedPortal role="admin" feature="overview">
                    <AdminDashboard />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/admin/students"
                element={
                  <ProtectedPortal role="admin" feature="users">
                    <AdminUsersPage role="student" />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/admin/teachers"
                element={
                  <ProtectedPortal role="admin" feature="users">
                    <AdminUsersPage role="teacher" />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/admin/courses"
                element={
                  <ProtectedPortal role="admin" feature="courses">
                    <AdminCourses />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/admin/enrollment-requests"
                element={
                  <ProtectedPortal role="admin" feature="enrollmentRequests">
                    <AdminEnrollmentRequests />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/admin/tutor-applications"
                element={
                  <ProtectedPortal role="admin" feature="tutorApplications">
                    <AdminTutorApplications />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedPortal role="admin" feature="settings">
                    <AdminSettings />
                  </ProtectedPortal>
                }
              />
              <Route path="/admin/deals" element={<ProtectedPortal role="admin" feature="deals"><AdminDeals /></ProtectedPortal>} />
              <Route path="/admin/live-classes" element={<ProtectedPortal role="admin" feature="liveClasses"><AdminLiveClasses /></ProtectedPortal>} />
              <Route
                path="/teacher"
                element={
                  <ProtectedPortal role="teacher">
                    <TeacherDashboard />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/student"
                element={
                  <ProtectedPortal role="student">
                    <StudentDashboard />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/student/catalog"
                element={
                  <ProtectedPortal role="student">
                    <StudentDashboard page="catalog" />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/student/courses"
                element={
                  <ProtectedPortal role="student">
                    <StudentDashboard page="courses" />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/student/live-classes"
                element={
                  <ProtectedPortal role="student">
                    <StudentLiveClasses />
                  </ProtectedPortal>
                }
              />
              <Route path="/live-class/:id" element={<LiveClassRoom />} />
              <Route
                path="/student/help"
                element={
                  <ProtectedPortal role="student">
                    <StudentDashboard page="help" />
                  </ProtectedPortal>
                }
              />
              <Route
                path="/student/settings"
                element={
                  <ProtectedPortal role="student">
                    <StudentDashboard page="settings" />
                  </ProtectedPortal>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;

createRoot(document.getElementById("root")!).render(<App />);
