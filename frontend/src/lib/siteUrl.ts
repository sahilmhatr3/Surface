/**
 * Public site origin for Supabase email redirect URLs.
 * Set VITE_APP_URL in production (e.g. https://app.example.com) so links in emails match your domain.
 */
export function getSiteUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_URL as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}
