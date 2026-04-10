/**
 * Public pilot request form — matches landing visual language.
 */
import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, submitContactPilot } from "../api/client";

const SATOSHI = "'Satoshi', 'DM Sans', system-ui, sans-serif";
const BG = "#0d0a14";
const TEXT = "#e8e4f0";
const MUTED = "#a89ec9";
const BORDER = "rgba(255,255,255,0.08)";

const btn =
  "inline-flex items-center justify-center px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-45 disabled:pointer-events-none";
const btnPrimary = `${btn} bg-white text-[#0d0a14] hover:bg-white/90`;

function isValidEmail(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="8" fill="rgba(255,255,255,0.08)" />
      <path
        d="M10 22V10h3.2v4.8L18.4 10H22l-5.6 5.2L22 22h-3.8l-4.4-4.8V22H10z"
        fill="white"
      />
    </svg>
  );
}

export default function PilotRequest() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): boolean {
    const err: Record<string, string> = {};
    if (!fullName.trim()) err.full_name = "Please enter your full name.";
    if (!email.trim()) err.email = "Please enter your email address.";
    else if (!isValidEmail(email)) err.email = "Please enter a valid email address.";
    if (!message.trim()) err.message = "Please tell us about your pilot request.";
    setFieldErrors(err);
    return Object.keys(err).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await submitContactPilot({
        full_name: fullName,
        email,
        subject: subject.trim() || undefined,
        message,
      });
      setSuccess(true);
      setFullName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setFieldErrors({});
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition-[box-shadow,border-color] focus-visible:ring-2 focus-visible:ring-cyan-400/40";

  return (
    <div className="min-h-svh" style={{ fontFamily: SATOSHI, background: BG, color: TEXT }}>
      <header
        className="flex items-center justify-between py-5 px-6 sm:px-10 border-b"
        style={{ borderColor: BORDER }}
      >
        <Link to="/" className="flex items-center gap-2.5 font-semibold text-white text-[15px]" aria-label="Surface home">
          <LogoMark size={22} />
          <span>Surface</span>
        </Link>
        <Link to="/login" className="text-sm font-medium transition-opacity hover:opacity-80" style={{ color: MUTED }}>
          Log in
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-6 py-16 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3">Start a pilot</h1>
        <p className="text-base leading-relaxed mb-10" style={{ color: MUTED }}>
          Tell us about your company and what you are looking for. We will follow up by email.
        </p>

        {success && (
          <div
            className="mb-8 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "rgba(34,211,238,0.1)",
              border: "1px solid rgba(34,211,238,0.25)",
              color: "#a5f3fc",
            }}
            role="status"
          >
            Thank you. Your request was sent. We will be in touch soon.
          </div>
        )}

        {error && (
          <div
            className="mb-8 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.25)",
              color: "#fecaca",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <div>
            <label htmlFor="pilot-full-name" className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
              Full name
            </label>
            <input
              id="pilot-full-name"
              name="full_name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
            />
            {fieldErrors.full_name && (
              <p className="mt-1.5 text-xs text-red-300/90">{fieldErrors.full_name}</p>
            )}
          </div>

          <div>
            <label htmlFor="pilot-email" className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
              Email address
            </label>
            <input
              id="pilot-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
            />
            {fieldErrors.email && (
              <p className="mt-1.5 text-xs text-red-300/90">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="pilot-subject" className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
              Subject <span className="font-normal normal-case opacity-70">(optional)</span>
            </label>
            <input
              id="pilot-subject"
              name="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
            />
          </div>

          <div>
            <label htmlFor="pilot-message" className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
              Message
            </label>
            <textarea
              id="pilot-message"
              name="message"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Company name, team size, and what you hope to learn from a pilot…"
              className={`${inputClass} resize-y min-h-[140px]`}
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
            />
            {fieldErrors.message && (
              <p className="mt-1.5 text-xs text-red-300/90">{fieldErrors.message}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? "Sending…" : "Submit request"}
            </button>
            <Link to="/" className="text-sm font-medium" style={{ color: MUTED }}>
              Back to home
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
