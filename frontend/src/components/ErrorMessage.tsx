/** Error state: dark background, soft gradient card, minimal */
export default function ErrorMessage({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6 sm:p-8 text-center max-w-md mx-auto">
      <p className="text-surface-text-strong font-medium">{title}</p>
      {message && (
        <p className="mt-2 text-sm text-surface-text-muted">{message}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-full text-sm font-medium text-surface-text-strong border border-surface-pill-border hover:border-white/40 hover:bg-white/5 transition-all"
        >
          Try again
        </button>
      )}
    </div>
  );
}
