import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import PilotRequest from "./pages/PilotRequest";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import Concept from "./pages/Concept";
import Presentation from "./pages/Presentation";
import Dashboard from "./pages/Dashboard";
import Teams from "./pages/Teams";
import Insights from "./pages/Insights";
import IncomingFeedback from "./pages/IncomingFeedback";
import AdminControls from "./pages/AdminControls";
import Feedback from "./pages/Feedback";
import Settings from "./pages/Settings";

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Landing page — self-contained marketing layout, no app navbar */}
        <Route path="/" element={<Landing />} />
        <Route path="/pilot" element={<PilotRequest />} />

        {/* App routes — shared layout with app navbar */}
        <Route element={<Layout />}>
          <Route path="login" element={<Login />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="auth/callback" element={<AuthCallback />} />
          <Route path="auth/reset-password" element={<ResetPassword />} />
          <Route path="concept" element={<Concept />} />
          <Route path="presentation" element={<Presentation />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="incoming-feedback" element={<IncomingFeedback />} />
          <Route path="admin-controls" element={<AdminControls />} />
          <Route path="teams" element={<Teams />} />
          <Route path="insights" element={<Insights />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
