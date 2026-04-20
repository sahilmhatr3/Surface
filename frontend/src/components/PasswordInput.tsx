import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

type PasswordInputProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  /** Base input classes (shared pill style from parent) */
  className: string;
  id?: string;
};

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  minLength,
  className,
  id: idProp,
}: PasswordInputProps) {
  const { t } = useTranslation();
  const genId = useId();
  const id = idProp ?? genId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`${className} pr-12`}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-full text-surface-text-muted hover:text-surface-text hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-surface-accent-cyan/50 transition-colors"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("password.hidePassword") : t("password.showPassword")}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={18} strokeWidth={2} aria-hidden /> : <Eye size={18} strokeWidth={2} aria-hidden />}
      </button>
    </div>
  );
}
