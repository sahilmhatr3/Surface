/** Minimal spinner matching dark theme: soft gradient, no harsh colors */
export default function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-block w-8 h-8 rounded-full border-2 border-surface-pill-border border-t-surface-accent-cyan/80 animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
