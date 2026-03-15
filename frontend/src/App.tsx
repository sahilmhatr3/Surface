import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Concept from "./pages/Concept";
import Presentation from "./pages/Presentation";
import Dashboard from "./pages/Dashboard";
import Teams from "./pages/Teams";
import Insights from "./pages/Insights";
import IncomingFeedback from "./pages/IncomingFeedback";
import AdminControls from "./pages/AdminControls";
import Feedback from "./pages/Feedback";
import ChangePassword from "./pages/ChangePassword";
import ForgotPassword from "./pages/ForgotPassword";
import ForgotPasswordVerify from "./pages/ForgotPasswordVerify";
import ForgotPasswordSetPassword from "./pages/ForgotPasswordSetPassword";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="forgot-password/verify" element={<ForgotPasswordVerify />} />
          <Route path="forgot-password/set-password" element={<ForgotPasswordSetPassword />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="concept" element={<Concept />} />
          <Route path="presentation" element={<Presentation />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="incoming-feedback" element={<IncomingFeedback />} />
          <Route path="admin-controls" element={<AdminControls />} />
          <Route path="teams" element={<Teams />} />
          <Route path="insights" element={<Insights />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
