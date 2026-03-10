/**
 * Forced password reset: shown when user.must_reset_password (e.g. after admin set initial password).
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { authApi } from "../api/client";
import { ApiError } from "../api/client";

const inputClass =
  "w-full px-4 py-3 rounded-full bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50";
const btnClass =
  "w-full py-3 rounded-full font-medium text-surface-bg bg-surface-text-strong hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-surface-accent-cyan/50 disabled:opacity-50 transition-all";

export default function ChangePassword() {
  const { user, loading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don’t match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      await refreshUser();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-surface-text-strong text-center mb-2">
          Set your password
        </h2>
        <p className="text-surface-text-muted text-sm text-center mb-6">
          Your admin set a temporary password. Choose a new one to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Current (temporary) password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
            required
            autoComplete="current-password"
          />
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
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
          <button type="submit" disabled={submitting} className={btnClass}>
            {submitting ? "Updating…" : "Set new password"}
          </button>
        </form>
      </div>
    </section>
  );
}
