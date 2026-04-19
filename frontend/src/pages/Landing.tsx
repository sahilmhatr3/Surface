/**
 * Surface marketing landing page.
 * Self-contained: does not use the app Layout or Navbar.
 * Font: Satoshi (loaded in index.html via Fontshare).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "../hooks/useAuth";
import {
  Users,
  Clock,
  EyeOff,
  MessageSquare,
  Lightbulb,
  BarChart2,
  TrendingUp,
  Lock,
  Cpu,
  Target,
  LayoutDashboard,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const SATOSHI = "'Satoshi', 'DM Sans', system-ui, sans-serif";
const BG = "#0d0a14";
const BG_ALT = "#07050f";
const TEXT = "#e8e4f0";
const MUTED = "#a89ec9";
const ACCENT = "#22d3ee";
const BORDER = "rgba(255,255,255,0.08)";

const btn =
  "inline-flex items-center justify-center px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
// Note: text-[#0d0a14] must be a literal string so Tailwind's static scanner generates the class.
const btnPrimary = `${btn} bg-white text-[#0d0a14] hover:bg-white/90`;
const btnOutline = `${btn} border border-white/30 text-white hover:bg-white/[0.06]`;

// ─── Section registry (drives floating nav) ───────────────────────────────────

const LANDING_SECTIONS = [
  { id: "hero", labelKey: "landing.sections.hero" },
  { id: "problem", labelKey: "landing.sections.problem" },
  { id: "standard-shift", labelKey: "landing.sections.standardShift" },
  { id: "how-it-works", labelKey: "landing.sections.howItWorks" },
  { id: "outcomes", labelKey: "landing.sections.outcomes" },
  { id: "features", labelKey: "landing.sections.features" },
  { id: "team", labelKey: "landing.sections.team" },
  { id: "cta", labelKey: "landing.sections.cta" },
] as const;

type SectionId = (typeof LANDING_SECTIONS)[number]["id"];

// ─── Language switcher (landing chrome; matches dark marketing page) ───────

const LANDING_LOCALES = [
  { code: "en" as const, flag: "🇬🇧", labelKey: "lang.english" as const },
  { code: "de" as const, flag: "🇩🇪", labelKey: "lang.german" as const },
];

function LandingLanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const resolved = i18n.resolvedLanguage?.startsWith("de") ? "de" : "en";
  const current = LANDING_LOCALES.find((l) => l.code === resolved) ?? LANDING_LOCALES[0];

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-xl text-sm text-white hover:bg-white/10 hover:border-white/25 transition-all"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("lang.switcherAria")}
      >
        <span className="text-base leading-none" aria-hidden>
          {current.flag}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`text-white/50 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 8L1 3h10L6 8z" />
        </svg>
      </button>
      {open && (
        <ul
          className="absolute right-0 top-full mt-1 py-1 min-w-[10rem] rounded-xl border border-white/12 bg-[#0d0a14]/95 backdrop-blur-xl shadow-lg z-[60]"
          role="listbox"
        >
          {LANDING_LOCALES.map((loc) => (
            <li key={loc.code} role="option" aria-selected={resolved === loc.code}>
              <button
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  resolved === loc.code ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/6 hover:text-white"
                }`}
                onClick={() => {
                  void i18n.changeLanguage(loc.code);
                  setOpen(false);
                }}
              >
                <span className="text-base leading-none" aria-hidden>
                  {loc.flag}
                </span>
                {t(loc.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── AnimateIn ───────────────────────────────────────────────────────────────

function AnimateIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) { setVisible(true); return; }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-500 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Logo ────────────────────────────────────────────────────────────────────

function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="llg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <path
        d="M16 4 L28 10 L28 22 L16 28 L4 22 L4 10 Z"
        stroke="url(#llg)"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M16 4 L16 16 M16 16 L28 10 M16 16 L4 10 M16 16 L16 28"
        stroke="url(#llg)"
        strokeWidth="1"
        opacity="0.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Section label ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-5" style={{ color: MUTED }}>
      {children}
    </p>
  );
}

// ─── Floating section nav ─────────────────────────────────────────────────────

function FloatingNav({ active }: { active: SectionId | null }) {
  const { t } = useTranslation();
  const [scrolling, setScrolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect scroll activity; revert to resting state 1.2 s after scroll stops.
  useEffect(() => {
    const onScroll = () => {
      setScrolling(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setScrolling(false), 1200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const activeIdx = LANDING_SECTIONS.findIndex(({ id }) => id === active);

  return (
    <nav
      aria-label={t("landing.aria.pageSections")}
      className="fixed right-5 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-end"
    >
      {LANDING_SECTIONS.map(({ id, labelKey }, i) => {
        const label = t(labelKey);
        const isActive = active === id;
        const dist = activeIdx >= 0 ? Math.abs(i - activeIdx) : 99;
        // Bell-curve pop: active dot shifts left 16 px, falls off sharply with distance.
        const popPx = scrolling ? Math.round(16 * Math.exp(-0.5 * dist * dist)) : 0;

        return (
          <div
            key={id}
            style={{ position: "relative", display: "flex", alignItems: "center", height: 28 }}
          >
            {/* Label — slides in during scroll, hidden at rest */}
            <span
              aria-hidden={!scrolling}
              style={{
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: "nowrap",
                marginRight: 10,
                letterSpacing: "0.025em",
                color: isActive ? "rgba(255,255,255,0.92)" : MUTED,
                opacity: scrolling ? 1 : 0,
                transform: scrolling ? "translateX(0)" : "translateX(8px)",
                // Stagger labels in top-to-bottom; snap out instantly on stop.
                transition: scrolling
                  ? `opacity 0.22s ease ${i * 18}ms, transform 0.22s ease ${i * 18}ms`
                  : "opacity 0.2s ease, transform 0.2s ease",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {label}
            </span>

            {/* Dot — bows outward (left) on a bell-curve arc during scroll */}
            <button
              type="button"
              onClick={() => scrollTo(id)}
              aria-label={t("landing.aria.navigateTo", { section: label })}
              style={{
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "none",
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
                // Negative X moves dot toward page center — the "wheel pop".
                transform: `translateX(-${popPx}px)`,
                transition: "transform 0.45s cubic-bezier(0.34, 1.4, 0.64, 1)",
              }}
            >
              <span
                style={{
                  display: "block",
                  borderRadius: "50%",
                  width: isActive ? 8 : 5,
                  height: isActive ? 8 : 5,
                  background: isActive ? "white" : "transparent",
                  border: isActive ? "none" : "1.5px solid rgba(255,255,255,0.28)",
                  boxShadow: isActive ? "0 0 10px rgba(255,255,255,0.5)" : "none",
                  transition: "all 0.2s ease",
                }}
              />
            </button>
          </div>
        );
      })}
    </nav>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

function LandingNav() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-4 transition-all duration-300 ${
        scrolled ? "py-3 px-6 sm:px-8 backdrop-blur-xl border-b" : "py-5 px-6 sm:px-10"
      }`}
      style={{
        background: scrolled ? `${BG}e6` : "transparent",
        borderColor: scrolled ? BORDER : "transparent",
      }}
    >
      <Link
        to="/"
        className="flex items-center gap-2.5 font-semibold text-white text-[15px]"
        aria-label={t("landing.aria.home")}
      >
        <LogoMark size={22} />
        <span>Surface</span>
      </Link>

      <div className="flex items-center gap-3 shrink-0">
        <LandingLanguageSwitcher />
        <Link to="/login" className={btnPrimary} style={{ paddingTop: "0.5rem", paddingBottom: "0.5rem" }}>
          {t("nav.login")}
        </Link>
      </div>
    </header>
  );
}

// ─── Section 1: Hero ─────────────────────────────────────────────────────────

function HeroSection() {
  const { t } = useTranslation();
  const mockThemes = [
    t("landing.hero.mockTheme1"),
    t("landing.hero.mockTheme2"),
    t("landing.hero.mockTheme3"),
  ];
  return (
    <section
      id="hero"
      className="relative flex flex-col items-center justify-center overflow-hidden"
      style={{ minHeight: "100svh", background: BG }}
    >
      {/* Background wordmark */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
        aria-hidden="true"
      >
        <span
          className="font-black text-white whitespace-nowrap leading-none"
          style={{ fontSize: "clamp(80px, 18vw, 340px)", opacity: 0.045 }}
        >
          Surface
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-4xl mx-auto pt-24 pb-64">
        <AnimateIn>
          <Label>{t("landing.hero.label")}</Label>
        </AnimateIn>

        <AnimateIn delay={80}>
          <h1
            className="text-[clamp(2.4rem,6vw,4.5rem)] leading-[1.1] tracking-tight mb-6"
            style={{ color: TEXT }}
          >
            <span className="font-normal">{t("landing.hero.titleLead")}</span>
            <span className="font-bold text-white">{t("landing.hero.titleStrong")}</span>
          </h1>
        </AnimateIn>

        <AnimateIn delay={160}>
          <p className="text-lg mb-10 max-w-xl" style={{ color: MUTED }}>
            {t("landing.hero.subtitle")}
          </p>
        </AnimateIn>

        <AnimateIn delay={240}>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/pilot" className={btnPrimary}>
              {t("landing.hero.startPilot")}
            </Link>
            <button className={btnOutline} disabled>
              {t("landing.hero.downloadPdf")}
            </button>
          </div>
        </AnimateIn>
      </div>

      {/* Dashboard preview strip */}
      <div className="absolute bottom-0 inset-x-0 h-60 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 z-10"
          style={{ background: `linear-gradient(to top, ${BG} 35%, ${BG}99 60%, transparent 100%)` }}
        />
        <div className="flex gap-4 justify-center px-6 pt-6">
          {/* Mock card 1 */}
          <div
            className="w-64 shrink-0 rounded-xl p-4 flex flex-col gap-3"
            style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold" style={{ color: MUTED }}>{t("landing.hero.mockHealth")}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(34,211,238,0.12)", color: ACCENT }}>{t("landing.hero.mockActive")}</span>
            </div>
            <div className="space-y-1.5">
              {[72, 85, 61].map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div className="h-full rounded-full" style={{ width: `${v}%`, background: ACCENT, opacity: 0.7 }} />
                  </div>
                  <span className="text-[10px] w-6 text-right" style={{ color: MUTED }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mock card 2 */}
          <div
            className="w-64 shrink-0 rounded-xl p-4 flex flex-col gap-3"
            style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${BORDER}` }}
          >
            <span className="text-[11px] font-semibold" style={{ color: MUTED }}>{t("landing.hero.mockCycle")}</span>
            <div className="space-y-2">
              {mockThemes.map((theme) => (
                <div key={theme} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCENT }} />
                  <span className="text-xs text-white font-medium">{theme}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: MUTED }}>{t("landing.hero.mockCycleCloses")}</p>
          </div>

          {/* Mock card 3 */}
          <div
            className="w-64 shrink-0 rounded-xl p-4 flex flex-col gap-2"
            style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${BORDER}` }}
          >
            <span className="text-[11px] font-semibold" style={{ color: MUTED }}>{t("landing.hero.mockActionTitle")}</span>
            <p className="text-xs text-white leading-relaxed">
              {t("landing.hero.mockActionBody")}
            </p>
            <span className="text-[10px] mt-auto px-2 py-0.5 rounded-full self-start font-medium"
              style={{ background: "rgba(167,139,250,0.14)", color: "#a78bfa" }}>{t("landing.hero.mockTeamWide")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section 2: Problem ───────────────────────────────────────────────────────

const PROBLEM_STAT_KEYS = ["stat1", "stat2", "stat3"] as const;

const PROBLEM_STAT_ICONS = [Users, Clock, EyeOff] as const;

function ProblemSection() {
  const { t } = useTranslation();
  return (
    <section id="problem" className="py-28 lg:py-36 px-6" style={{ background: BG }}>
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_1fr] gap-16 items-start">
        <AnimateIn>
          <Label>{t("landing.problem.label")}</Label>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.2] tracking-tight mb-8"
            style={{ color: TEXT }}
          >
            {t("landing.problem.title")}
          </h2>
          <p className="mb-4 leading-relaxed" style={{ color: MUTED }}>
            {t("landing.problem.p1")}
          </p>
          <p className="mb-12 leading-relaxed" style={{ color: MUTED }}>
            {t("landing.problem.p2")}
          </p>
          <Link to="/pilot" className={btnPrimary}>{t("landing.problem.startPilot")}</Link>
        </AnimateIn>

        <div className="flex flex-col gap-4">
          {PROBLEM_STAT_KEYS.map((statKey, i) => {
            const Icon = PROBLEM_STAT_ICONS[i];
            const label = t(`landing.problem.${statKey}.label`);
            const sub = t(`landing.problem.${statKey}.sub`);
            return (
            <AnimateIn key={statKey} delay={i * 80}>
              <div
                className="flex items-start gap-5 p-6 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}
              >
                <Icon size={18} className="shrink-0 mt-0.5" style={{ color: MUTED }} />
                <div>
                  <p className="font-semibold text-white text-sm leading-snug mb-1">{label}</p>
                  <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{sub}</p>
                </div>
              </div>
            </AnimateIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Section 3: Standard Shift ────────────────────────────────────────────────

function StandardShiftSection() {
  const { t } = useTranslation();
  const before = t("landing.standard.before", { returnObjects: true }) as string[];
  const after = t("landing.standard.after", { returnObjects: true }) as string[];
  return (
    <section id="standard-shift" className="py-28 lg:py-36 px-6" style={{ background: BG_ALT }}>
      <div className="max-w-5xl mx-auto">
        <AnimateIn className="text-center mb-16">
          <Label>{t("landing.standard.label")}</Label>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight"
            style={{ color: TEXT }}
          >
            {t("landing.standard.title")}
          </h2>
        </AnimateIn>

        <div className="grid sm:grid-cols-2 gap-6">
          <AnimateIn>
            <div
              className="p-8 rounded-2xl h-full"
              style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}
            >
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-6" style={{ color: MUTED }}>
                {t("landing.standard.beforeTitle")}
              </p>
              <ul className="space-y-4">
                {before.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: MUTED }} />
                    <span className="text-sm leading-relaxed" style={{ color: MUTED }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </AnimateIn>

          <AnimateIn delay={120}>
            <div
              className="p-8 rounded-2xl h-full"
              style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.15)" }}
            >
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-6" style={{ color: ACCENT }}>
                {t("landing.standard.afterTitle")}
              </p>
              <ul className="space-y-4">
                {after.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: ACCENT }} />
                    <span className="text-sm leading-relaxed text-white">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </AnimateIn>
        </div>

        <AnimateIn delay={160}>
          <p className="text-center text-sm mt-12 max-w-2xl mx-auto leading-relaxed" style={{ color: MUTED }}>
            {t("landing.standard.footer")}
          </p>
        </AnimateIn>
      </div>
    </section>
  );
}

// ─── Section 4: How it works ──────────────────────────────────────────────────

const HOW_IT_WORKS_STEPS = [
  { icon: Users, titleKey: "landing.howItWorks.step1Title", bodyKey: "landing.howItWorks.step1Body" },
  { icon: MessageSquare, titleKey: "landing.howItWorks.step2Title", bodyKey: "landing.howItWorks.step2Body" },
  { icon: Lightbulb, titleKey: "landing.howItWorks.step3Title", bodyKey: "landing.howItWorks.step3Body" },
] as const;

function HowItWorksSection() {
  const { t } = useTranslation();
  return (
    <section id="how-it-works" className="py-28 lg:py-36 px-6" style={{ background: BG }}>
      <div className="max-w-5xl mx-auto">
        <AnimateIn className="text-center mb-16">
          <Label>{t("landing.howItWorks.label")}</Label>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight mb-3"
            style={{ color: TEXT }}
          >
            {t("landing.howItWorks.title")}
          </h2>
          <p style={{ color: MUTED }}>{t("landing.howItWorks.subtitle")}</p>
        </AnimateIn>

        <div className="grid sm:grid-cols-3 gap-5">
          {HOW_IT_WORKS_STEPS.map(({ icon: Icon, titleKey, bodyKey }, i) => (
            <AnimateIn key={titleKey} delay={i * 100}>
              <div
                className="relative overflow-hidden p-7 rounded-2xl h-full"
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}
              >
                <span
                  className="absolute -right-3 -bottom-4 font-black leading-none select-none pointer-events-none"
                  style={{ fontSize: 120, color: "rgba(255,255,255,0.04)" }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <Icon size={20} className="mb-6" style={{ color: ACCENT }} />
                <h3 className="font-bold text-white text-base mb-2">{t(titleKey)}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{t(bodyKey)}</p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 5: Outcomes (bento) ──────────────────────────────────────────────

/** Decorative in-page “dashboard” preview (no real data; matches hero mock style). */
function OutcomesDashboardMock({ t, themeLabels }: { t: TFunction; themeLabels: string[] }) {
  return (
    <div className="w-full flex flex-col gap-3 p-3 sm:p-4 text-left overflow-hidden" aria-hidden="true">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full" style={{ background: "rgba(248,113,113,0.55)" }} />
            <span className="w-2 h-2 rounded-full" style={{ background: "rgba(250,204,21,0.55)" }} />
            <span className="w-2 h-2 rounded-full" style={{ background: "rgba(74,222,128,0.5)" }} />
          </span>
          <span className="text-[10px] font-semibold text-white/90 truncate">
            {t("landing.outcomes.mockChromeTitle")}
          </span>
        </div>
        <span
          className="text-[9px] px-2 py-0.5 rounded-full shrink-0 font-medium whitespace-nowrap"
          style={{ background: "rgba(34,211,238,0.12)", color: ACCENT }}
        >
          {t("landing.outcomes.mockOpenBadge")}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,7.75rem)] gap-3 flex-1 min-h-[108px]">
        <div
          className="rounded-lg p-2.5 flex flex-col min-h-[96px]"
          style={{ background: "rgba(0,0,0,0.28)", border: `1px solid ${BORDER}` }}
        >
          <span className="text-[9px] font-medium mb-1.5" style={{ color: MUTED }}>
            {t("landing.outcomes.mockTrendCaption")}
          </span>
          <svg viewBox="0 0 240 72" className="w-full h-auto max-h-[76px]" preserveAspectRatio="xMidYMid meet">
            {[18, 36, 54].map((y) => (
              <line key={y} x1="28" y1={y} x2="232" y2={y} stroke="white" strokeOpacity="0.06" strokeWidth="1" />
            ))}
            <path
              d="M 28 48 L 76 42 L 124 44 L 172 32 L 220 36"
              fill="none"
              stroke="#67e8f9"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeOpacity="0.92"
            />
            <path
              d="M 28 56 L 76 50 L 124 38 L 172 28 L 220 22"
              fill="none"
              stroke="#a78bfa"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeOpacity="0.92"
            />
            {[
              [76, 42],
              [124, 44],
              [172, 32],
              [220, 36],
            ].map(([cx, cy], i) => (
              <circle key={`c-${i}`} cx={cx} cy={cy} r="2.2" fill="#67e8f9" fillOpacity="0.95" />
            ))}
            {[
              [76, 50],
              [124, 38],
              [172, 28],
              [220, 22],
            ].map(([cx, cy], i) => (
              <circle key={`v-${i}`} cx={cx} cy={cy} r="2.2" fill="#a78bfa" fillOpacity="0.95" />
            ))}
          </svg>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 justify-center sm:justify-start">
            <span className="text-[8px] flex items-center gap-1" style={{ color: MUTED }}>
              <span className="w-2 h-0.5 rounded-full shrink-0" style={{ background: "#67e8f9" }} />
              {t("landing.outcomes.mockLegendPerf")}
            </span>
            <span className="text-[8px] flex items-center gap-1" style={{ color: MUTED }}>
              <span className="w-2 h-0.5 rounded-full shrink-0" style={{ background: "#a78bfa" }} />
              {t("landing.outcomes.mockLegendImpact")}
            </span>
          </div>
        </div>

        <div
          className="rounded-lg p-2.5 flex flex-col gap-1.5 justify-start"
          style={{ background: "rgba(0,0,0,0.22)", border: `1px solid ${BORDER}` }}
        >
          <span className="text-[9px] font-medium" style={{ color: MUTED }}>
            {t("landing.outcomes.mockThemesHeader")}
          </span>
          {themeLabels.map((label) => (
            <div key={label} className="flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full shrink-0 mt-1" style={{ background: ACCENT }} />
              <span className="text-[9px] text-white/90 leading-snug line-clamp-2">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "landing.outcomes.mockPillRants", v: "12" },
            { key: "landing.outcomes.mockPillStructured", v: "28" },
            { key: "landing.outcomes.mockPillThemes", v: "5" },
          ] as const
        ).map(({ key, v }) => (
          <span
            key={key}
            className="text-[9px] px-2.5 py-1 rounded-full font-medium"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, color: MUTED }}
          >
            <span className="text-white/90 font-semibold">{v}</span>
            {" · "}
            {t(key)}
          </span>
        ))}
      </div>
    </div>
  );
}

function OutcomesSection() {
  const { t } = useTranslation();
  const mockThemes = [
    t("landing.hero.mockTheme1"),
    t("landing.hero.mockTheme2"),
    t("landing.hero.mockTheme3"),
  ];
  return (
    <section id="outcomes" className="py-28 lg:py-36 px-6" style={{ background: BG_ALT }}>
      <div className="max-w-5xl mx-auto">
        <AnimateIn className="mb-12">
          <Label>{t("landing.outcomes.label")}</Label>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight leading-[1.2]"
            style={{ color: TEXT }}
          >
            {t("landing.outcomes.titleLine1")}
            <br className="hidden sm:block" />
            {t("landing.outcomes.titleLine2")}
          </h2>
        </AnimateIn>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <AnimateIn className="sm:col-span-2">
            <div
              className="p-7 rounded-2xl h-full min-h-[320px] flex flex-col"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}
            >
              <BarChart2 size={18} className="mb-4" style={{ color: ACCENT }} />
              <h3 className="font-bold text-white text-base mb-2">
                {t("landing.outcomes.card1Title")}
              </h3>
              <p className="text-sm mb-6" style={{ color: MUTED }}>
                {t("landing.outcomes.card1Body")}
              </p>
              <div
                className="flex-1 rounded-xl min-h-[160px] sm:min-h-[180px] flex flex-col"
                style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
              >
                <OutcomesDashboardMock t={t} themeLabels={mockThemes} />
              </div>
            </div>
          </AnimateIn>

          <div className="flex flex-col gap-5">
            <AnimateIn delay={100} className="flex-1">
              <div
                className="p-7 rounded-2xl h-full"
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}
              >
                <Users size={18} className="mb-4" style={{ color: ACCENT }} />
                <h3 className="font-bold text-white text-sm leading-snug">
                  {t("landing.outcomes.card2Title")}
                </h3>
              </div>
            </AnimateIn>

            <AnimateIn delay={180} className="flex-1">
              <div
                className="p-7 rounded-2xl h-full"
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}
              >
                <TrendingUp size={18} className="mb-4" style={{ color: ACCENT }} />
                <h3 className="font-bold text-white text-sm leading-snug">
                  {t("landing.outcomes.card3Title")}
                </h3>
              </div>
            </AnimateIn>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section 6: Features (light bg) ──────────────────────────────────────────

const FEATURE_BLOCKS = [
  { num: "01", icon: Lock, titleKey: "landing.features.f1Title", bodyKey: "landing.features.f1Body" },
  { num: "02", icon: Cpu, titleKey: "landing.features.f2Title", bodyKey: "landing.features.f2Body" },
  { num: "03", icon: Target, titleKey: "landing.features.f3Title", bodyKey: "landing.features.f3Body" },
  { num: "04", icon: LayoutDashboard, titleKey: "landing.features.f4Title", bodyKey: "landing.features.f4Body" },
] as const;

function FeaturesSection() {
  const { t } = useTranslation();
  return (
    <section id="features" className="py-28 lg:py-36 px-6" style={{ background: "#f2effa" }}>
      <div className="max-w-5xl mx-auto">
        <AnimateIn>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-5" style={{ color: "#6b5faa" }}>
            {t("landing.features.label")}
          </p>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight mb-5"
            style={{ color: "#1a1225" }}
          >
            {t("landing.features.title")}
          </h2>
          <p className="max-w-2xl leading-relaxed mb-16 text-base" style={{ color: "#4a3f70" }}>
            {t("landing.features.intro")}
          </p>
        </AnimateIn>

        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURE_BLOCKS.map(({ num, icon: Icon, titleKey, bodyKey }, i) => (
            <AnimateIn key={num} delay={i * 80}>
              <div
                className="p-8 rounded-2xl bg-white h-full transition-shadow duration-200 hover:shadow-md"
                style={{ border: "1px solid #e4dfef" }}
              >
                <div className="flex items-center justify-between mb-7">
                  <span className="text-xs font-bold tracking-widest" style={{ color: "#6b5faa" }}>{num}</span>
                  <Icon size={16} style={{ color: "#6b5faa" }} />
                </div>
                <h3 className="font-bold text-base mb-3 leading-snug" style={{ color: "#1a1225" }}>{t(titleKey)}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#4a3f70" }}>{t(bodyKey)}</p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 7: Team ─────────────────────────────────────────────────────────

const FOUNDERS = [
  {
    name: "Moreno Nigro",
    asset: "/assets/moreno.jpg",
    website: "https://morenonigro.com",
    key: "moreno",
  },
  {
    name: "Sahil Mhatre",
    asset: "/assets/sahil.jpg",
    website: "https://sahilmhatre.com",
    key: "sahil",
  },
] as const;

function TeamSection() {
  const { t } = useTranslation();
  return (
    <section id="team" className="py-28 lg:py-36 px-6" style={{ background: BG }}>
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_auto] gap-16 items-center">
        <AnimateIn>
          <Label>{t("landing.team.label")}</Label>
          <p className="text-xl leading-relaxed max-w-lg" style={{ color: TEXT }}>
            {t("landing.team.body")}
          </p>
        </AnimateIn>

        {/* Inline founder cards at the same level */}
        <div className="flex gap-5 items-start">
          {FOUNDERS.map(({ name, asset, website, key }, i) => (
            <AnimateIn key={key} delay={i * 100}>
              <div
                className="w-52 rounded-2xl overflow-hidden"
                style={{ background: "#f2effa", border: "1px solid #e4dfef" }}
              >
                <div
                  className="w-full h-52 flex items-center justify-center"
                  style={{ background: "#e4dfef" }}
                >
                  <img
                    src={asset}
                    alt={`${name} profile`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-5">
                  <p className="font-bold text-sm leading-snug mb-1" style={{ color: "#1a1225" }}>{name}</p>
                  <p className="text-[11px] leading-snug mb-0.5" style={{ color: "#4a3f70" }}>
                    {t(`landing.team.founders.${key}.title`)}
                  </p>
                  <p className="text-[11px] leading-snug mb-4" style={{ color: "#7a6fa0" }}>
                    {t(`landing.team.founders.${key}.sub`)}
                  </p>
                  <a
                    href={website}
                    className="inline-flex items-center justify-center w-full py-1.5 rounded-full text-[11px] font-semibold transition-colors"
                    style={{ border: "1px solid #d4cee8", color: "#4a3f70" }}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("landing.team.visitWebsiteAria", { name })}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#e4dfef")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {t("landing.team.viewWebsite")}
                  </a>
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 8: Final CTA ─────────────────────────────────────────────────────

function FinalCTASection() {
  const { t } = useTranslation();
  return (
    <section id="cta" className="py-32 lg:py-40 px-6 text-center" style={{ background: BG_ALT }}>
      <div className="max-w-3xl mx-auto">
        <AnimateIn>
          <h2
            className="text-[clamp(2.4rem,6vw,4rem)] font-bold tracking-tight leading-[1.1] mb-6"
            style={{ color: TEXT }}
          >
            {t("landing.cta.titleLine1")}
            <br />
            {t("landing.cta.titleLine2")}
          </h2>
          <p className="text-lg mb-12" style={{ color: MUTED }}>
            {t("landing.cta.subtitle")}
          </p>
          <Link
            to="/pilot"
            className={btnPrimary}
            style={{ fontSize: "0.9375rem", padding: "0.875rem 2rem" }}
          >
            {t("landing.cta.startPilot")}
          </Link>
        </AnimateIn>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function LandingFooter() {
  const { t } = useTranslation();
  return (
    <footer
      className="py-8 px-6 sm:px-10"
      style={{ background: BG, borderTop: `1px solid ${BORDER}` }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-white" aria-label={t("landing.aria.home")}>
          <LogoMark size={18} />
          <span>Surface</span>
        </Link>
        <p className="text-xs" style={{ color: MUTED }}>
          {t("landing.footer.rights", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  const [activeSection, setActiveSection] = useState<SectionId | null>("hero");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { i18n } = useTranslation();
  const { user, loading: authLoading } = useAuth();

  // Optional: /?lng=de or ?lng=en (also picked up on full page load via i18n detector order).
  useEffect(() => {
    const lng = searchParams.get("lng");
    if (lng === "en" || lng === "de") {
      void i18n.changeLanguage(lng);
    }
  }, [searchParams, i18n]);

  // Logged-in users go straight to the app (password recovery keeps user=null until reset completes).
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Track which section is in the middle of the viewport
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    LANDING_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id as SectionId);
        },
        { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <div style={{ fontFamily: SATOSHI, background: BG, color: TEXT }}>
      <LandingNav />
      <FloatingNav active={activeSection} />
      <main>
        <HeroSection />
        <ProblemSection />
        <StandardShiftSection />
        <HowItWorksSection />
        <OutcomesSection />
        <FeaturesSection />
        <TeamSection />
        <FinalCTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
