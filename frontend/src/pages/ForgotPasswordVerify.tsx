/**
 * Step 2: Enter 6-digit OTP in 6 boxes. On success, go to set-password with reset_token.
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { authApi } from "../api/client";
import { ApiError } from "../api/client";

const boxClass =
  "w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-xl bg-white/5 border border-surface-pill-border text-surface-text-strong focus:outline-none focus:border-surface-accent-cyan/50 focus:ring-2 focus:ring-surface-accent-cyan/30";

export default function ForgotPasswordVerify() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = (location.state as { email?: string } | null)?.email ?? "";
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) navigate("/forgot-password");
  }, [email, navigate]);

  const setDigit = useCallback((index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (value !== "" && !/^[0-9]$/.test(value)) return;
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }, []);

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigit(index - 1, "");
    }
  };

  const otp = digits.join("");
  const canSubmit = otp.length === 6 && email;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const { reset_token } = await authApi.verifyResetOtp(email, otp);
      navigate("/forgot-password/set-password", { state: { reset_token } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid or expired code.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!email) return null;

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-surface-text-strong text-center mb-2">
          Enter the code
        </h2>
        <p className="text-surface-text-muted text-sm text-center mb-8">
          We sent a 6-digit code to <span className="text-surface-text-strong">{email}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-center gap-2 sm:gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digits[i]}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={boxClass}
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full py-3 rounded-full font-medium text-surface-bg bg-surface-text-strong hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-surface-accent-cyan/50 disabled:opacity-50 transition-all"
          >
            {submitting ? "Verifying…" : "Continue"}
          </button>
        </form>
        <p className="mt-4 text-center">
          <Link
            to="/forgot-password"
            className="text-sm text-surface-text-muted hover:text-surface-accent-cyan transition-colors"
          >
            Use a different email
          </Link>
        </p>
      </div>
    </section>
  );
}
