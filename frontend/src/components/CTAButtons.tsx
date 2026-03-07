/**
 * Hero CTA: Concept (left) and Presentation (right).
 * Thin white outline, rounded pill, hover glow/gradient.
 */
import { Link } from "react-router-dom";

interface CTAButtonsProps {
  conceptLabel?: string;
  presentationLabel?: string;
}

export default function CTAButtons({
  conceptLabel = "Concept",
  presentationLabel = "Presentation",
}: CTAButtonsProps) {
  const base =
    "inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-3.5 rounded-full text-sm sm:text-base font-medium text-surface-text-strong border border-white/30 bg-white/5 backdrop-blur-sm transition-all duration-300 hover:border-white/50 hover:bg-white/10 hover:shadow-glow hover:shadow-cyan-500/20";

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8 sm:mt-10">
      <Link to="/concept" className={base}>
        {conceptLabel}
      </Link>
      <Link to="/presentation" className={base}>
        {presentationLabel}
      </Link>
    </div>
  );
}
