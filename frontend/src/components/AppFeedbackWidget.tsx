import { useState } from "react";
import { MessageSquare, Paperclip, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { appFeedbackApi } from "../api/client";
import type { AppFeedbackAttachment } from "../api/types";
import { useAuth } from "../hooks/useAuth";

const CATEGORIES = [
  { value: "", labelKey: "appFeedback.categories.none" as const },
  { value: "bug", labelKey: "appFeedback.categories.bug" as const },
  { value: "ux", labelKey: "appFeedback.categories.ux" as const },
  { value: "feature", labelKey: "appFeedback.categories.feature" as const },
  { value: "performance", labelKey: "appFeedback.categories.performance" as const },
  { value: "other", labelKey: "appFeedback.categories.other" as const },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function AppFeedbackWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<AppFeedbackAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user) return null;

  const canSubmit =
    category.trim().length > 0 || text.trim().length > 0 || attachments.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setSuccess(null);
          setError(null);
        }}
        className="fixed right-4 bottom-4 z-[80] flex items-center gap-2 px-3 py-2 rounded-full border border-white/[0.12] bg-[var(--color-surface-bg,#0a0a0f)]/95 backdrop-blur-xl text-sm text-surface-text-strong hover:bg-white/10 transition-all shadow-lg"
      >
        <MessageSquare size={16} aria-hidden />
        {t("appFeedback.trigger")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[var(--color-surface-bg,#0a0a0f)] p-4 sm:p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-semibold text-surface-text-strong">{t("appFeedback.title")}</h2>
                <p className="text-xs text-surface-text-muted mt-0.5">{t("appFeedback.subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-surface-text-muted hover:text-surface-text hover:bg-white/10"
                aria-label={t("appFeedback.close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-surface-text-muted mb-1">{t("appFeedback.category")}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-surface-pill-border text-surface-text text-sm focus:outline-none focus:border-surface-accent-cyan/50"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.labelKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-surface-text-muted mb-1">{t("appFeedback.message")}</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder={t("appFeedback.placeholder")}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-surface-pill-border text-surface-text text-sm focus:outline-none focus:border-surface-accent-cyan/50 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs text-surface-text-muted mb-1">{t("appFeedback.files")}</label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-pill-border text-surface-text-muted hover:text-surface-text hover:bg-white/5 cursor-pointer text-sm">
                  <Paperclip size={14} />
                  {t("appFeedback.attach")}
                  <input
                    type="file"
                    accept="image/*,.pdf,.txt"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const fileList = Array.from(e.target.files ?? []);
                      e.currentTarget.value = "";
                      if (fileList.length === 0) return;
                      try {
                        const next: AppFeedbackAttachment[] = [];
                        for (const f of fileList.slice(0, 5)) {
                          if (f.size > 5_000_000) continue;
                          const dataUrl = await readFileAsDataUrl(f);
                          next.push({
                            filename: f.name,
                            mime_type: f.type || "application/octet-stream",
                            size_bytes: f.size,
                            data_url: dataUrl,
                          });
                        }
                        setAttachments((prev) => [...prev, ...next].slice(0, 5));
                      } catch {
                        setError(t("appFeedback.fileReadError"));
                      }
                    }}
                  />
                </label>
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((a, idx) => (
                      <li key={`${a.filename}-${idx}`} className="flex items-center gap-2 text-xs text-surface-text-muted">
                        <span className="truncate">{a.filename}</span>
                        <span>({Math.round(a.size_bytes / 1024)} KB)</span>
                        <button
                          type="button"
                          onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                          className="ml-auto text-red-300 hover:text-red-200"
                        >
                          {t("appFeedback.removeFile")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              {success && <p className="text-sm text-emerald-300">{success}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 rounded-lg border border-surface-pill-border text-sm text-surface-text-muted hover:text-surface-text hover:bg-white/5"
                >
                  {t("appFeedback.cancel")}
                </button>
                <button
                  type="button"
                  disabled={submitting || !canSubmit}
                  onClick={async () => {
                    if (!canSubmit) return;
                    setSubmitting(true);
                    setError(null);
                    try {
                      await appFeedbackApi.submit({
                        category: category || null,
                        text: text || null,
                        attachments,
                      });
                      setSuccess(t("appFeedback.success"));
                      setCategory("");
                      setText("");
                      setAttachments([]);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : t("appFeedback.submitError"));
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-surface-text-strong text-surface-bg text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? t("appFeedback.sending") : t("appFeedback.send")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
