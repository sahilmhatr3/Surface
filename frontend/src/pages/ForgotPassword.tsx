/**
 * Step 1: Enter email to receive OTP (for now OTP is 123456; email later).
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "../api/client";
import { ApiError } from "../api/client";

const inputClass =
  "w-full px-4 py-3 rounded-full bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50";
const btnClass =
  "w-full py-3 rounded-full font-medium text-surface-bg bg-surface-text-strong hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-surface-accent-cyan/50 disabled:opacity-50 transition-all";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      navigate("/forgot-password/verify", { state: { email: email.trim() } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-surface-text-strong text-center mb-2">
          Forgot password?
        </h2>
        <p className="text-surface-text-muted text-sm text-center mb-6">
          Enter your email and we’ll send you a 6-digit code to reset your password.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            required
            autoComplete="email"
          />
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          <button type="submit" disabled={loading} className={btnClass}>
            {loading ? "Sending…" : "Send code"}
          </button>
        </form>
        <p className="mt-4 text-center">
          <Link
            to="/login"
            className="text-sm text-surface-text-muted hover:text-surface-accent-cyan transition-colors"
          >
            Back to Sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
