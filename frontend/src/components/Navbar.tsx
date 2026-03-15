/**
 * Top navigation bar.
 * BRANDING: Change product name (Surface) in Layout or here.
 */
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const LOGO_MARK = (
  <svg
    width="28"
    height="28"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="shrink-0"
    aria-hidden
  >
    <defs>
      <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a78bfa" />
        <stop offset="100%" stopColor="#e879f9" />
      </linearGradient>
    </defs>
    <path
      d="M16 4 L28 10 L28 22 L16 28 L4 22 L4 10 Z"
      stroke="url(#logoGrad)"
      strokeWidth="1.5"
      fill="none"
      strokeLinejoin="round"
    />
    <path
      d="M16 4 L16 16 M16 16 L28 10 M16 16 L4 10 M16 16 L16 28"
      stroke="url(#logoGrad)"
      strokeWidth="1"
      opacity="0.7"
      strokeLinecap="round"
    />
  </svg>
);

interface NavbarProps {
  /** Product name shown next to logo (e.g. "Surface") */
  productName?: string;
}

export default function Navbar({ productName = "Surface" }: NavbarProps) {
  const { user, logout } = useAuth();
  const pillClass =
    "px-3 py-1.5 rounded-full text-xs sm:text-sm border border-surface-pill-border bg-surface-pill-hover/50 backdrop-blur-sm hover:border-white/40 hover:shadow-glow transition-all";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
      <Link
        to="/"
        className="flex items-center gap-2 text-surface-text-strong font-semibold tracking-tight hover:opacity-90 transition-opacity"
      >
        {LOGO_MARK}
        <span className="text-lg">{productName}</span>
      </Link>
      <nav className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
        {user && (
          <>
            <Link to="/dashboard" className={`${pillClass} text-surface-text-strong`}>
              Dashboard
            </Link>
            <Link to="/feedback" className={`${pillClass} text-surface-text-strong`}>
              Feedback
            </Link>
            <Link to="/incoming-feedback" className={`${pillClass} text-surface-text-strong`}>
              Incoming feedback
            </Link>
            {user.role === "admin" && (
              <>
                <Link to="/admin-controls" className={`${pillClass} text-surface-text-strong`}>
                  Admin
                </Link>
                <Link to="/teams" className={`${pillClass} text-surface-text-strong`}>
                  Teams
                </Link>
              </>
            )}
            <Link to="/insights" className={`${pillClass} text-surface-text-strong`}>
              Insights
            </Link>
            <button
              type="button"
              onClick={logout}
              className={`${pillClass} text-surface-text-strong`}
            >
              Log out
            </button>
          </>
        )}
        {!user && (
          <Link to="/login" className={`${pillClass} text-surface-text-strong`}>
            Log in
          </Link>
        )}
      </nav>
    </header>
  );
}
