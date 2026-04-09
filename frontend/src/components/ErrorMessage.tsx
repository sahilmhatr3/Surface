/** Error state: dark background, soft gradient card, minimal */
import { useTranslation } from "react-i18next";

export default function ErrorMessage({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("common.somethingWrong");
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6 sm:p-8 text-center max-w-md mx-auto">
      <p className="text-surface-text-strong font-medium">{resolvedTitle}</p>
      {message && (
        <p className="mt-2 text-sm text-surface-text-muted">{message}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-full text-sm font-medium text-surface-text-strong border border-surface-pill-border hover:border-white/40 hover:bg-white/5 transition-all"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
