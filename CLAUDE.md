# Project Architectural Contract

## Tech Stack & Environment

- **Framework & Bundler:** React 18+ with Vite (SPA mode)
- **Styling:** Tailwind CSS (configured via PostCSS / Tailwind CLI)
- **Language:** TypeScript (Strict mode enabled, ESNext target)
- **Deployment Target:** Vercel (Static SPA deployment with client-side routing fallback)
- **Testing & Quality Stack:** Vitest (unit testing), Istanbul (coverage), crap4ts (complexity/CRAP analysis), Stryker (mutation testing), Playwright-BDD (acceptance testing)

## Directory Structure

- `specs/features/` — Human-authored Gherkin BDD specifications (READ-ONLY for agents).
- `src/` — React components, hooks, state management, and utility services.
- `src/components/` — Atomic UI components styled with Tailwind CSS classes.
- `tests/step-definitions/` — Cucumber/Playwright BDD glue step definitions.
- `scripts/harness.ts` — The deterministic AI agent gauntlet orchestrator.

## Engineering Rules

1. **Spec Integrity:** Never modify files under `specs/features/`. They are the human source of truth.
2. **Component Architecture:** Build modular, functional React components with explicit TypeScript props interfaces. Avoid inline styles; use Tailwind utility classes.
3. **Build & Type Safety:** Code must compile cleanly with `npx tsc -b` and pass Vite production builds (`npx vite build`) without warnings or errors. (The root `tsconfig.json` only holds project references, so `tsc --noEmit` checks nothing.)
4. **Stay Within Your Responsibility:** Each harness agent may only change files in its own scope (Coder/Cleaner: `src/`; Hardener: unit test files; QA: `tests/`). Configuration, package files, specs and scripts are off-limits to every agent; out-of-scope changes are reverted automatically.
