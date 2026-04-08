import type { Session } from "@supabase/supabase-js";

function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(pad);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function amrIncludesRecovery(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (entry === "recovery") return true;
    if (entry && typeof entry === "object" && "method" in entry) {
      return (entry as { method?: string }).method === "recovery";
    }
    return false;
  });
}

/**
 * True when the session comes from a password-recovery email link.
 * Normal sign-in sessions must not be used on the reset-password form (avoids changing
 * the wrong account when another user is still logged in).
 */
export function isPasswordRecoverySession(session: Session | null | undefined): boolean {
  if (!session?.access_token) return false;
  const payload = decodeJwtPayload(session.access_token);
  if (!payload) return false;
  return amrIncludesRecovery(payload.amr);
}
