import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const LOCALES = [
  { code: "en", flag: "🇬🇧", labelKey: "lang.english" as const },
  { code: "de", flag: "🇩🇪", labelKey: "lang.german" as const },
];

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = LOCALES.find((l) => l.code === i18n.language) ?? LOCALES[0];

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/[0.07] bg-white/[0.04] backdrop-blur-2xl text-sm text-surface-text-strong hover:bg-white/8 hover:border-white/20 transition-all"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("lang.switcherAria")}
      >
        <span className="text-base leading-none" aria-hidden>
          {current.flag}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`text-surface-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 8L1 3h10L6 8z" />
        </svg>
      </button>
      {open && (
        <ul
          className="absolute right-0 top-full mt-1 py-1 min-w-[10rem] rounded-xl border border-white/[0.08] bg-[var(--color-surface-bg,#0a0a0f)]/98 backdrop-blur-xl shadow-lg z-[60]"
          role="listbox"
        >
          {LOCALES.map((loc) => (
            <li key={loc.code} role="option" aria-selected={i18n.language === loc.code}>
              <button
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i18n.language === loc.code
                    ? "bg-white/10 text-surface-text-strong"
                    : "text-surface-text-muted hover:bg-white/5 hover:text-surface-text"
                }`}
                onClick={() => {
                  void i18n.changeLanguage(loc.code);
                  setOpen(false);
                }}
              >
                <span className="text-base leading-none" aria-hidden>
                  {loc.flag}
                </span>
                {t(loc.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
