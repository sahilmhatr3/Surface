# Surface Frontend

React + TypeScript + Vite frontend for Surface, wired to the existing FastAPI backend.

## Run locally

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`. API requests go to `/api`, proxied to `http://localhost:8000` (see `vite.config.ts`). To point at another backend, set `VITE_API_URL` in `.env`.

## Build

```bash
npm run build
npm run preview   # serve dist/
```

## Branding and theme

- **Hero headline and emphasis:** `src/components/Hero.tsx` — `headlineText`, `headlineStrong`, `watermarkWord`.
- **Nav bar:** `src/components/Navbar.tsx` — `productName`, `navAuthorLabel`, `navDateLabel`.
- **Colors and spacing:** `tailwind.config.js` — `theme.extend.colors` (`surface-bg`, `surface-text-strong`, `surface-accent-*`, etc.).
- **Global CSS variables:** `src/index.css` — `:root` (optional overrides).

All paths and request/response shapes match the backend API; see `src/api/client.ts` and `src/api/types.ts`.
