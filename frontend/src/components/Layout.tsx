/**
 * Main layout: Navbar + outlet.
 */
import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Navbar from "./Navbar";

/**
 * Supabase "Site URL" often points at "/". Email links then open "/" with tokens in the hash.
 * After the client parses the session, send users to the route that matches the flow.
 */
function useAuthEmailRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const path = window.location.pathname;

      if (event === "PASSWORD_RECOVERY" && session) {
        if (!path.startsWith("/auth/reset-password")) {
          navigate("/auth/reset-password", { replace: true });
        }
        return;
      }

      if (event === "SIGNED_IN" && session && (path === "/" || path === "")) {
        navigate("/auth/callback", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);
}

export default function Layout() {
  useAuthEmailRedirect();

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-bg to-surface-bg-end">
      <Navbar />
      <main className="pt-[72px] sm:pt-20">
        <Outlet />
      </main>
    </div>
  );
}
