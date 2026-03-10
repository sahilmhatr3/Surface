/**
 * Step 3: Set new password using reset_token (forgot-password flow). No current password.
 */
import { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { authApi } from "../api/client";
import { ApiError } from "../api/client";

const inputClass =
  "w-full px-4 py-3 rounded-full bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50";
const btnClass =
  "w-full py-3 rounded-full font-medium text-surface-bg bg-surface-text-strong hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-surface-accent-cyan/50 disabled:opacity-50 transition-all";

export default function ForgotPasswordSetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const resetToken = (location.state as { reset_token?: string } | null)?.reset_token ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!resetToken) navigate("/forgot-password");
  }, [resetToken, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don’t match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword(resetToken, newPassword);
      navigate("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!resetToken) return null;

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-surface-text-strong text-center mb-2">
          Set new password
        </h2>
        <p className="text-surface-text-muted text-sm text-center mb-6">
          Choose a new password for your account.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          <button type="submit" disabled={submitting} className={btnClass}>
            {submitting ? "Saving…" : "Save password"}
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
