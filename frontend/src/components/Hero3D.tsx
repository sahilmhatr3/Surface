/**
 * 3D-style iridescent/holographic placeholder for the hero.
 * CSS-only stacked bars with gradient and subtle animation; optional parallax via mouse.
 */
import { useRef, useState, useCallback } from "react";

export default function Hero3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = (e.clientX - cx) / (rect.width / 2);
    const y = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: y * 4, y: -x * 4 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-md mx-auto h-48 sm:h-56 flex items-center justify-center perspective-1000"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: "800px" }}
    >
      <div
        className="relative w-3/4 h-32 flex items-end justify-center gap-2 sm:gap-3 transition-transform duration-300 ease-out"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
      >
        {/* Stacked elongated bars with iridescent gradient */}
        <div
          className="w-12 sm:w-14 h-24 rounded-lg bg-gradient-to-br from-surface-accent-cyan/90 via-surface-accent-magenta/80 to-surface-accent-blue/90 shadow-glow-cyan animate-float opacity-90"
          style={{
            boxShadow:
              "0 0 30px rgba(34, 211, 238, 0.3), 0 0 60px rgba(232, 121, 249, 0.15)",
          }}
        />
        <div
          className="w-14 sm:w-16 h-28 rounded-lg bg-gradient-to-br from-surface-accent-magenta/90 via-surface-accent-blue/80 to-surface-accent-cyan/90 shadow-glow-magenta animate-float opacity-95"
          style={{
            animationDelay: "1s",
            boxShadow:
              "0 0 35px rgba(232, 121, 249, 0.3), 0 0 70px rgba(96, 165, 250, 0.15)",
          }}
        />
        <div
          className="w-12 sm:w-14 h-[5.5rem] rounded-lg bg-gradient-to-br from-surface-accent-blue/90 via-surface-accent-cyan/80 to-surface-accent-magenta/90 shadow-glow animate-float opacity-90"
          style={{
            animationDelay: "2s",
            boxShadow:
              "0 0 30px rgba(96, 165, 250, 0.3), 0 0 60px rgba(34, 211, 238, 0.15)",
          }}
        />
      </div>
    </div>
  );
}
