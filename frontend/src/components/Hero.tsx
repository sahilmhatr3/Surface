/**
 * Full-screen hero section.
 * BRANDING: Change headline in headlineText / headlineStrong, or subtext. Colors in tailwind.config.js.
 */
import Hero3D from "./Hero3D";
import CTAButtons from "./CTAButtons";

const defaultHeadline = "Effective leadership, empowered by";
const defaultHeadlineStrong = "actionable insight from the team.";

interface HeroProps {
  /** Main line before the emphasized phrase */
  headlineText?: string;
  /** Emphasized phrase (bold/white) */
  headlineStrong?: string;
  /** Large background watermark word (e.g. "Surface") */
  watermarkWord?: string;
}

export default function Hero({
  headlineText = defaultHeadline,
  headlineStrong = defaultHeadlineStrong,
  watermarkWord = "Surface",
}: HeroProps) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 overflow-hidden">
      {/* Large low-opacity background typography */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        aria-hidden
      >
        <span
          className="text-[clamp(6rem,20vw,14rem)] font-bold uppercase tracking-[0.02em] text-surface-watermark"
          style={{ opacity: 0.12 }}
        >
          {watermarkWord}
        </span>
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto text-center">
        {/* Centered headline: two-tone */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight text-surface-text">
          {headlineText}{" "}
          <span className="text-surface-text-strong">{headlineStrong}</span>
        </h1>

        {/* 3D iridescent object */}
        <div className="mt-10 sm:mt-14">
          <Hero3D />
        </div>

        {/* Pill CTAs */}
        <CTAButtons />
      </div>
    </section>
  );
}
