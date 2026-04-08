/**
 * Top navigation bar — floating island design with scroll-aware collapse.
 * Not scrolled: logo left | nav island center | user chip right
 * Scrolled:     logo center | avatar + hamburger right | solid backdrop
 * BRANDING: Change product name (Surface) in Layout or here.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi } from "../api/client";
import LanguageSwitcher from "./LanguageSwitcher";

// ---------- icons ----------

const LOGO_SVG = (size = 26) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0" aria-hidden>
    <defs>
      <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a78bfa" />
        <stop offset="100%" stopColor="#e879f9" />
      </linearGradient>
    </defs>
    <path d="M16 4 L28 10 L28 22 L16 28 L4 22 L4 10 Z" stroke="url(#logoGrad)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    <path d="M16 4 L16 16 M16 16 L28 10 M16 16 L4 10 M16 16 L16 28" stroke="url(#logoGrad)" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
  </svg>
);

const LOGOUT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      {open ? (
        <>
          <line x1="3" y1="3" x2="15" y2="15" className="transition-all" />
          <line x1="15" y1="3" x2="3" y2="15" className="transition-all" />
        </>
      ) : (
        <>
          <line x1="3" y1="5" x2="15" y2="5" />
          <line x1="3" y1="9" x2="15" y2="9" />
          <line x1="3" y1="13" x2="15" y2="13" />
        </>
      )}
    </svg>
  );
}

// ---------- helpers ----------

const ROLE_COLORS: Record<string, string> = {
  admin:    "bg-violet-500/20 text-violet-300 border-violet-500/25",
  manager:  "bg-sky-500/20 text-sky-300 border-sky-500/25",
  employee: "bg-white/8 text-surface-text-muted border-white/10",
};

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ---------- component ----------

interface NavbarProps {
  productName?: string;
}

export default function Navbar({ productName = "Surface" }: NavbarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasOpenCycle, setHasOpenCycle] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check for open cycles to show the indicator dot
  useEffect(() => {
    if (!user) { setHasOpenCycle(false); return; }
    cyclesApi.listCycles()
      .then((c) => setHasOpenCycle(c.some((cy) => cy.status === "open")))
      .catch(() => {});
  }, [user]);

  // Track scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu on navigation
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Treat /feedback, /incoming-feedback, and /insights as the same top-level section
  const FEEDBACK_PATHS = ["/feedback", "/incoming-feedback", "/insights"];

  function isActive(to: string) {
    if (to === "/feedback") {
      return FEEDBACK_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));
    }
    return location.pathname === to || location.pathname.startsWith(to + "/");
  }

  function navLink(to: string, label: string, onClick?: () => void) {
    const active = isActive(to);
    const showDot = to === "/feedback" && hasOpenCycle && !active;
    return (
      <Link
        key={to}
        to={to}
        onClick={onClick}
        className={[
          "relative px-3.5 py-1.5 rounded-full text-sm transition-all duration-150",
          active
            ? "bg-white/10 text-surface-text-strong font-medium"
            : "text-surface-text-muted hover:text-surface-text hover:bg-white/5",
        ].join(" ")}
      >
        {label}
        {showDot && (
          <span
            className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-400"
            aria-label={t("nav.openCycleAvailable")}
          />
        )}
      </Link>
    );
  }

  const navLinks = user ? (
    <>
      {navLink("/dashboard", t("nav.dashboard"))}
      {navLink("/feedback", t("nav.feedback"))}
      {user.role === "admin" && (
        <>
          <span className="w-px h-3.5 bg-white/10 mx-1 shrink-0" aria-hidden />
          {navLink("/admin-controls", t("nav.admin"))}
          {navLink("/teams", t("nav.teams"))}
        </>
      )}
    </>
  ) : null;

  return (
    <>
      {/* ── header bar ── */}
      <header
        className={[
          "fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-all duration-300",
          scrolled
            ? "px-4 sm:px-6 py-2 bg-[var(--color-surface-bg,#0a0a0f)]/90 backdrop-blur-xl border-b border-white/[0.06] shadow-[0_1px_0_rgba(255,255,255,0.04)]"
            : "px-5 sm:px-8 py-3.5",
        ].join(" ")}
      >
        {/* LEFT — logo (fades out when scrolled; keeps width so right side stays flush) */}
        <Link
          to="/"
          className={[
            "flex items-center gap-2 text-surface-text-strong font-semibold tracking-tight hover:opacity-80 transition-all duration-300",
            scrolled ? "opacity-0 pointer-events-none" : "opacity-100",
          ].join(" ")}
          tabIndex={scrolled ? -1 : 0}
          aria-hidden={scrolled}
        >
          {LOGO_SVG(26)}
          <span className="text-[15px]">{productName}</span>
        </Link>

        {/* CENTER — nav island (not scrolled) ↔ logo (scrolled) — both absolutely centered */}

        {/* Nav island: fades out + rises when scrolled */}
        {user && (
          <nav
            className={[
              "absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-white/[0.07] bg-white/[0.04] backdrop-blur-2xl px-1.5 py-1",
              "shadow-[0_0_0_1px_rgba(255,255,255,0.03)] transition-all duration-300",
              scrolled
                ? "opacity-0 pointer-events-none -translate-y-2 scale-95"
                : "opacity-100 translate-y-0 scale-100",
            ].join(" ")}
          >
            {navLinks}
          </nav>
        )}

        {/* Centered logo: fades in when scrolled */}
        <Link
          to="/"
          className={[
            "absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-surface-text-strong font-semibold tracking-tight hover:opacity-80 transition-all duration-300",
            scrolled
              ? "opacity-100 translate-y-0"
              : "opacity-0 pointer-events-none translate-y-1",
          ].join(" ")}
          tabIndex={scrolled ? 0 : -1}
          aria-hidden={!scrolled}
        >
          {LOGO_SVG(22)}
          <span className="text-[14px]">{productName}</span>
        </Link>

        {/* RIGHT */}
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />
          {user ? (
            <>
              {/* Full user chip — visible when NOT scrolled */}
              <div
                className={[
                  "flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] backdrop-blur-2xl px-2.5 py-1.5",
                  "transition-all duration-300",
                  scrolled ? "opacity-0 pointer-events-none w-0 overflow-hidden px-0 border-transparent" : "opacity-100",
                ].join(" ")}
                aria-hidden={scrolled}
              >
                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0 select-none">
                  {initials(user.name)}
                </span>
                <span className="text-xs text-surface-text hidden sm:inline whitespace-nowrap">{user.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium capitalize hidden sm:inline whitespace-nowrap ${ROLE_COLORS[user.role] ?? ROLE_COLORS.employee}`}>
                  {t(`common.roles.${user.role}`, { defaultValue: user.role })}
                </span>
              </div>

              {/* Logout icon — visible when NOT scrolled */}
              <button
                type="button"
                onClick={logout}
                title={t("nav.logout")}
                className={[
                  "p-1.5 rounded-full text-surface-text-muted/40 hover:text-surface-text-muted hover:bg-white/5 transition-all duration-300",
                  scrolled ? "opacity-0 pointer-events-none w-0 overflow-hidden p-0" : "opacity-100",
                ].join(" ")}
                aria-hidden={scrolled}
                tabIndex={scrolled ? -1 : 0}
              >
                {LOGOUT_ICON}
              </button>

              {/* Avatar — always visible (gives visual anchor when scrolled) */}
              <span
                className={[
                  "w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 select-none transition-all duration-300",
                  scrolled ? "opacity-100 scale-100" : "opacity-0 scale-75 w-0 overflow-hidden",
                ].join(" ")}
                title={user.name}
                aria-hidden={!scrolled}
              >
                {initials(user.name)}
              </span>

              {/* Hamburger — visible when scrolled */}
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
                aria-expanded={menuOpen}
                className={[
                  "p-1.5 rounded-full transition-all duration-300",
                  menuOpen
                    ? "bg-white/10 text-surface-text-strong"
                    : "text-surface-text-muted hover:text-surface-text hover:bg-white/5",
                  scrolled ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                ].join(" ")}
                tabIndex={scrolled ? 0 : -1}
              >
                <HamburgerIcon open={menuOpen} />
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="px-3.5 py-1.5 rounded-full text-sm border border-white/[0.07] bg-white/[0.04] backdrop-blur-2xl text-surface-text-strong hover:bg-white/8 hover:border-white/20 transition-all"
            >
              {t("nav.login")}
            </Link>
          )}
        </div>
      </header>

      {/* ── hamburger dropdown menu ── */}
      {user && (
        <div
          ref={menuRef}
          className={[
            "fixed left-0 right-0 z-40 transition-all duration-200 ease-out",
            scrolled ? "top-[52px]" : "top-[64px]",
            menuOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none",
          ].join(" ")}
        >
          <div className="mx-3 sm:mx-6 rounded-2xl border border-white/[0.08] bg-[var(--color-surface-bg,#0a0a0f)]/95 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">

            {/* Nav links grid */}
            <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-1">
              {[
                { to: "/dashboard", label: t("nav.dashboard") },
                { to: "/feedback", label: t("nav.feedback") },
                ...(user.role === "admin"
                  ? [
                      { to: "/admin-controls", label: t("nav.admin") },
                      { to: "/teams", label: t("nav.teams") },
                    ]
                  : []),
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={[
                    "flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isActive(to)
                      ? "bg-white/10 text-surface-text-strong"
                      : "text-surface-text-muted hover:text-surface-text hover:bg-white/5",
                  ].join(" ")}
                >
                  {label}
                </Link>
              ))}
            </div>

            {/* Footer: user info + logout */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {initials(user.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-surface-text-strong truncate font-medium">{user.name}</p>
                  <p className="text-[11px] text-surface-text-muted capitalize">
                    {t(`common.roles.${user.role}`, { defaultValue: user.role })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); logout(); }}
                className="flex items-center gap-1.5 text-xs text-surface-text-muted hover:text-surface-text transition-colors px-3 py-1.5 rounded-full hover:bg-white/5 shrink-0"
              >
                {LOGOUT_ICON}
                <span>{t("nav.logout")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
