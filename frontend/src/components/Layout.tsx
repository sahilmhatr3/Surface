/**
 * Main layout: Navbar + outlet.
 * BRANDING:
 *   - Product name, author label, date: pass to Navbar or edit Navbar defaults.
 *   - Global theme: tailwind.config.js and src/index.css.
 */
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

export default function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-bg to-surface-bg-end">
      <Navbar />
      <main className="pt-[72px] sm:pt-20">
        <Outlet />
      </main>
    </div>
  );
}
