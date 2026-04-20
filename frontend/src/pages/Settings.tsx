/**
 * Account settings: UI language (stored server-side for signed-in users).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import LoadingSpinner from "../components/LoadingSpinner";

const LOCALES = [
  { code: "en" as const, flag: "🇬🇧", labelKey: "lang.english" as const },
  { code: "de" as const, flag: "🇩🇪", labelKey: "lang.german" as const },
];

export default function Settings() {
  const { t } = useTranslation();
  const { user, loading, updateMyLocale } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="pt-24 px-5 sm:px-8 max-w-2xl mx-auto flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const current = user.locale === "de" ? "de" : "en";

  return (
    <div className="pt-24 px-5 sm:px-8 pb-16 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-surface-text-strong tracking-tight mb-1">
        {t("settings.title")}
      </h1>
      <p className="text-surface-text-muted text-sm mb-8">{t("settings.subtitle")}</p>

      <section className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
        <h2 className="text-sm font-medium text-surface-text-strong mb-1">{t("settings.languageTitle")}</h2>
        <p className="text-xs text-surface-text-muted mb-4">{t("settings.languageHelp")}</p>
        {error && <p className="text-sm text-red-400/90 mb-3">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((loc) => (
            <button
              key={loc.code}
              type="button"
              disabled={saving}
              onClick={() => {
                if (loc.code === current) return;
                setError(null);
                setSaving(true);
                void updateMyLocale(loc.code)
                  .catch((e) => {
                    setError(e instanceof Error ? e.message : t("settings.saveFailed"));
                  })
                  .finally(() => setSaving(false));
              }}
              className={[
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                current === loc.code
                  ? "border-surface-accent-cyan/50 bg-surface-accent-cyan/10 text-surface-text-strong"
                  : "border-surface-pill-border text-surface-text-muted hover:text-surface-text hover:bg-white/5",
              ].join(" ")}
            >
              <span className="text-lg leading-none" aria-hidden>
                {loc.flag}
              </span>
              {t(loc.labelKey)}
            </button>
          ))}
        </div>
        {saving && <p className="text-xs text-surface-text-muted mt-3">{t("common.saving")}</p>}
      </section>
    </div>
  );
}
