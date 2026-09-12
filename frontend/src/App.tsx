import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/common/AppLayout";
import { GuestOnly, RequireAuth } from "./components/common/AuthRoutes";
import Toaster from "./components/common/Toaster";
import LandingPage from "./pages/LandingPage";
import NotFoundPage from "./pages/NotFoundPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import LoginPage from "./pages/auth/LoginPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import SignupPage from "./pages/auth/SignupPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import CandidateDashboard from "./pages/candidate/DashboardPage";
import JobDetailsPage from "./pages/candidate/JobDetailsPage";
import JobsPage from "./pages/candidate/JobsPage";
import MyApplicationsPage from "./pages/candidate/MyApplicationsPage";
import InterviewPage from "./pages/interview/InterviewPage";
import ApplicantDetailPage from "./pages/recruiter/ApplicantDetailPage";
import ApplicantsPage from "./pages/recruiter/ApplicantsPage";
import RecruiterDashboard from "./pages/recruiter/DashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GuestOnly><LandingPage /></GuestOnly>} />
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
        {/* Email links: these work whether or not the user is signed in on this device */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route element={<RequireAuth role="CANDIDATE" />}>
          <Route element={<AppLayout />}>
            <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
            <Route path="/candidate/jobs" element={<JobsPage />} />
            <Route path="/candidate/jobs/:jobId" element={<JobDetailsPage />} />
            <Route path="/candidate/applications" element={<MyApplicationsPage />} />
            <Route path="/candidate/interview/:applicationId" element={<InterviewPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth role="RECRUITER" />}>
          <Route element={<AppLayout />}>
            <Route path="/recruiter/dashboard" element={<RecruiterDashboard />} />
            <Route path="/recruiter/jobs/:jobId/applicants" element={<ApplicantsPage />} />
            <Route path="/recruiter/applications/:applicationId" element={<ApplicantDetailPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
