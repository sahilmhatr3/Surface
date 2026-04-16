/**
 * Surface marketing landing page.
 * Self-contained: does not use the app Layout or Navbar.
 * Font: Satoshi (loaded in index.html via Fontshare).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const SECTIONS = [
  { id: "hero",           label: "Overview"     },
  { id: "problem",        label: "The Problem"  },
  { id: "standard-shift", label: "New Standard" },
  { id: "how-it-works",   label: "How It Works" },
  { id: "outcomes",       label: "Outcomes"     },
  { id: "features",       label: "Product"      },
  { id: "team",           label: "Team"         },
  { id: "cta",            label: "Get Started"  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

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

  const activeIdx = SECTIONS.findIndex(({ id }) => id === active);

  return (
    <nav
      aria-label="Page sections"
      className="fixed right-5 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-end"
    >
      {SECTIONS.map(({ id, label }, i) => {
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
              aria-label={`Navigate to ${label}`}
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 flex items-center justify-between transition-all duration-300 ${
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
        aria-label="Surface home"
      >
        <LogoMark size={22} />
        <span>Surface</span>
      </Link>

      <Link to="/login" className={btnPrimary} style={{ paddingTop: "0.5rem", paddingBottom: "0.5rem" }}>
        Log in
      </Link>
    </header>
  );
}

// ─── Section 1: Hero ─────────────────────────────────────────────────────────

function HeroSection() {
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
          <Label>AI Leadership Assistant</Label>
        </AnimateIn>

        <AnimateIn delay={80}>
          <h1
            className="text-[clamp(2.4rem,6vw,4.5rem)] leading-[1.1] tracking-tight mb-6"
            style={{ color: TEXT }}
          >
            <span className="font-normal">We help leaders </span>
            <span className="font-bold text-white">develop high-performing teams.</span>
          </h1>
        </AnimateIn>

        <AnimateIn delay={160}>
          <p className="text-lg mb-10 max-w-xl" style={{ color: MUTED }}>
            For the first time, the insight you've always needed, surfaced automatically.
          </p>
        </AnimateIn>

        <AnimateIn delay={240}>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/pilot" className={btnPrimary}>
              Start a Pilot
            </Link>
            <button className={btnOutline} disabled>
              Download PDF
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
              <span className="text-[11px] font-semibold" style={{ color: MUTED }}>Team Health</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(34,211,238,0.12)", color: ACCENT }}>Active</span>
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
            <span className="text-[11px] font-semibold" style={{ color: MUTED }}>Current Cycle</span>
            <div className="space-y-2">
              {["Communication", "Collaboration", "Delivery"].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCENT }} />
                  <span className="text-xs text-white font-medium">{t}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: MUTED }}>Cycle closes in 4 days</p>
          </div>

          {/* Mock card 3 */}
          <div
            className="w-64 shrink-0 rounded-xl p-4 flex flex-col gap-2"
            style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${BORDER}` }}
          >
            <span className="text-[11px] font-semibold" style={{ color: MUTED }}>Latest Action</span>
            <p className="text-xs text-white leading-relaxed">
              Schedule bi-weekly 1:1s to address communication gaps identified in the last cycle.
            </p>
            <span className="text-[10px] mt-auto px-2 py-0.5 rounded-full self-start font-medium"
              style={{ background: "rgba(167,139,250,0.14)", color: "#a78bfa" }}>Team-wide</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section 2: Problem ───────────────────────────────────────────────────────

const PROBLEM_STATS = [
  {
    icon: Users,
    label: "Team disengagement goes undetected",
    sub: "By the time it's visible, the damage is already done.",
  },
  {
    icon: Clock,
    label: "Performance reviews happen too late",
    sub: "Annual cycles capture yesterday's problems, not today's reality.",
  },
  {
    icon: EyeOff,
    label: "Leaders lack the visibility to act",
    sub: "Without honest input, decisions are made on incomplete information.",
  },
];

function ProblemSection() {
  return (
    <section id="problem" className="py-28 lg:py-36 px-6" style={{ background: BG }}>
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_1fr] gap-16 items-start">
        <AnimateIn>
          <Label>The Problem</Label>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.2] tracking-tight mb-8"
            style={{ color: TEXT }}
          >
            People leadership shouldn't stand in the way of profits and growth.
          </h2>
          <p className="mb-4 leading-relaxed" style={{ color: MUTED }}>
            Teams become quietly disengaged as team chemistry deteriorates.
          </p>
          <p className="mb-12 leading-relaxed" style={{ color: MUTED }}>
            Buried in workload, leaders' efforts never translate into real performance.
          </p>
          <Link to="/pilot" className={btnPrimary}>Start a Pilot</Link>
        </AnimateIn>

        <div className="flex flex-col gap-4">
          {PROBLEM_STATS.map(({ icon: Icon, label, sub }, i) => (
            <AnimateIn key={label} delay={i * 80}>
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
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 3: Standard Shift ────────────────────────────────────────────────

const BEFORE = [
  "Feedback filtered through hierarchy",
  "Managers guessing what's really happening",
  "Annual reviews capturing yesterday's problems",
  "People development relying on individual manager capacity",
];

const AFTER = [
  "Honest input from every voice on the team",
  "Aggregated themes surfaced automatically after every cycle",
  "Continuous insight that reflects how the team actually feels today",
  "AI turns input into individual and team development plans at scale",
];

function StandardShiftSection() {
  return (
    <section id="standard-shift" className="py-28 lg:py-36 px-6" style={{ background: BG_ALT }}>
      <div className="max-w-5xl mx-auto">
        <AnimateIn className="text-center mb-16">
          <Label>A new standard</Label>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight"
            style={{ color: TEXT }}
          >
            The standard has changed.
          </h2>
        </AnimateIn>

        <div className="grid sm:grid-cols-2 gap-6">
          <AnimateIn>
            <div
              className="p-8 rounded-2xl h-full"
              style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}
            >
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-6" style={{ color: MUTED }}>
                Before Surface
              </p>
              <ul className="space-y-4">
                {BEFORE.map((item) => (
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
                With Surface
              </p>
              <ul className="space-y-4">
                {AFTER.map((item) => (
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
            This level of insight was previously inaccessible, not for lack of intention,
            but for lack of the right infrastructure.
          </p>
        </AnimateIn>
      </div>
    </section>
  );
}

// ─── Section 4: How it works ──────────────────────────────────────────────────

const STEPS = [
  {
    icon: Users,
    title: "Set up your team",
    body: "Invite your team in minutes. Surface handles the structure.",
  },
  {
    icon: MessageSquare,
    title: "Collect honest input",
    body: "Everyone shares structured, anonymous feedback each cycle.",
  },
  {
    icon: Lightbulb,
    title: "Lead with clarity",
    body: "Surface translates input into insights and clear development guidance.",
  },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-28 lg:py-36 px-6" style={{ background: BG }}>
      <div className="max-w-5xl mx-auto">
        <AnimateIn className="text-center mb-16">
          <Label>Process</Label>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight mb-3"
            style={{ color: TEXT }}
          >
            How it works
          </h2>
          <p style={{ color: MUTED }}>Three steps to a high-performing team.</p>
        </AnimateIn>

        <div className="grid sm:grid-cols-3 gap-5">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <AnimateIn key={title} delay={i * 100}>
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
                <h3 className="font-bold text-white text-base mb-2">{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{body}</p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 5: Outcomes (bento) ──────────────────────────────────────────────

function OutcomesSection() {
  return (
    <section id="outcomes" className="py-28 lg:py-36 px-6" style={{ background: BG_ALT }}>
      <div className="max-w-5xl mx-auto">
        <AnimateIn className="mb-12">
          <Label>Outcomes</Label>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight leading-[1.2]"
            style={{ color: TEXT }}
          >
            What leading a high-performing
            <br className="hidden sm:block" /> team looks like.
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
                Clear insight into individual and team dynamics
              </h3>
              <p className="text-sm mb-6" style={{ color: MUTED }}>
                Understand exactly where your team stands, updated after every feedback cycle.
              </p>
              <div
                className="flex-1 rounded-xl flex items-center justify-center min-h-[140px]"
                style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
                data-src="/assets/dashboard-screenshot.png"
              >
                {/* REPLACE: /assets/dashboard-screenshot.png */}
                <span className="text-xs font-mono px-3 text-center" style={{ color: MUTED }}>
                  REPLACE: /assets/dashboard-screenshot.png
                </span>
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
                  People development scales beyond one leader's capacity
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
                  Teams grow into high performers driving real results
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

const FEATURES = [
  {
    num: "01",
    icon: Lock,
    title: "Honest, Confidential Input",
    body: "Structured and unstructured feedback flows from every team member, anonymized before it reaches a manager, so people say what they actually mean.",
  },
  {
    num: "02",
    icon: Cpu,
    title: "Intelligent AI Analysis",
    body: "Surface clusters themes, weighs sentiment, and identifies signal from noise, turning hundreds of individual responses into a coherent picture of team health.",
  },
  {
    num: "03",
    icon: Target,
    title: "Actionable Development Plans",
    body: "AI-generated actions, each editable by the manager, translate insight directly into specific, targeted next steps at both the individual and team level.",
  },
  {
    num: "04",
    icon: LayoutDashboard,
    title: "Dashboard Visibility",
    body: "A single place to track historical trends, score movement, open cycles, published actions, and upcoming feedback windows, so nothing gets lost.",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="py-28 lg:py-36 px-6" style={{ background: "#f2effa" }}>
      <div className="max-w-5xl mx-auto">
        <AnimateIn>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-5" style={{ color: "#6b5faa" }}>
            Product
          </p>
          <h2
            className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight mb-5"
            style={{ color: "#1a1225" }}
          >
            Introducing Surface.
          </h2>
          <p className="max-w-2xl leading-relaxed mb-16 text-base" style={{ color: "#4a3f70" }}>
            Surface is a leadership and team development system that turns honest team input
            into actionable insight and clear guidance, enabling leaders to develop people
            effectively at scale.
          </p>
        </AnimateIn>

        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map(({ num, icon: Icon, title, body }, i) => (
            <AnimateIn key={num} delay={i * 80}>
              <div
                className="p-8 rounded-2xl bg-white h-full transition-shadow duration-200 hover:shadow-md"
                style={{ border: "1px solid #e4dfef" }}
              >
                <div className="flex items-center justify-between mb-7">
                  <span className="text-xs font-bold tracking-widest" style={{ color: "#6b5faa" }}>{num}</span>
                  <Icon size={16} style={{ color: "#6b5faa" }} />
                </div>
                <h3 className="font-bold text-base mb-3 leading-snug" style={{ color: "#1a1225" }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#4a3f70" }}>{body}</p>
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
    title: "Business Administration, University of Zurich",
    sub: "Retail Strategy, Mercedes-Benz",
    asset: "/assets/moreno.jpg",
    website: "https://morenonigro.com",
    key: "moreno",
  },
  {
    name: "Sahil Mhatre",
    title: "Forward Deployed Engineer, Palantir",
    sub: "MS Computer Science, Cornell University",
    asset: "/assets/sahil.jpg",
    website: "https://sahilmhatre.com",
    key: "sahil",
  },
];

function TeamSection() {
  return (
    <section id="team" className="py-28 lg:py-36 px-6" style={{ background: BG }}>
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_auto] gap-16 items-center">
        <AnimateIn>
          <Label>The Team</Label>
          <p className="text-xl leading-relaxed max-w-lg" style={{ color: TEXT }}>
            We know how difficult it is to develop people without the insight,
            time, or guidance needed. With backgrounds in computer science and
            business, we bring a fresh, unbiased perspective that makes high
            performance happen by default.
          </p>
        </AnimateIn>

        {/* Inline founder cards at the same level */}
        <div className="flex gap-5 items-start">
          {FOUNDERS.map(({ name, title, sub, asset, website, key }, i) => (
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
                  <p className="text-[11px] leading-snug mb-0.5" style={{ color: "#4a3f70" }}>{title}</p>
                  <p className="text-[11px] leading-snug mb-4" style={{ color: "#7a6fa0" }}>{sub}</p>
                  <a
                    href={website}
                    className="inline-flex items-center justify-center w-full py-1.5 rounded-full text-[11px] font-semibold transition-colors"
                    style={{ border: "1px solid #d4cee8", color: "#4a3f70" }}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Visit ${name} website`}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#e4dfef")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    View Website
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
  return (
    <section id="cta" className="py-32 lg:py-40 px-6 text-center" style={{ background: BG_ALT }}>
      <div className="max-w-3xl mx-auto">
        <AnimateIn>
          <h2
            className="text-[clamp(2.4rem,6vw,4rem)] font-bold tracking-tight leading-[1.1] mb-6"
            style={{ color: TEXT }}
          >
            Your team's next level
            <br />
            starts here.
          </h2>
          <p className="text-lg mb-12" style={{ color: MUTED }}>
            Run a free pilot. See what your team has been waiting to say.
          </p>
          <Link
            to="/pilot"
            className={btnPrimary}
            style={{ fontSize: "0.9375rem", padding: "0.875rem 2rem" }}
          >
            Start a Pilot
          </Link>
        </AnimateIn>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer
      className="py-8 px-6 sm:px-10"
      style={{ background: BG, borderTop: `1px solid ${BORDER}` }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-white" aria-label="Surface home">
          <LogoMark size={18} />
          <span>Surface</span>
        </Link>
        <p className="text-xs" style={{ color: MUTED }}>
          &copy; {new Date().getFullYear()} Surface. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  const [activeSection, setActiveSection] = useState<SectionId | null>("hero");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Logged-in users go straight to the app (password recovery keeps user=null until reset completes).
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Track which section is in the middle of the viewport
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTIONS.forEach(({ id }) => {
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
