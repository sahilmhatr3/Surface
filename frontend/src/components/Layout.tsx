/**
 * Main layout: Navbar + outlet.
 * When user must reset password, redirect to /change-password until they do.
 */
import { useLocation, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Navbar from "./Navbar";

export default function Layout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isChangePasswordPage = location.pathname === "/change-password";

  if (!loading && user?.must_reset_password && !isChangePasswordPage) {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-bg to-surface-bg-end">
      <Navbar />
      <main className="pt-[72px] sm:pt-20">
        <Outlet />
      </main>
    </div>
  );
}
