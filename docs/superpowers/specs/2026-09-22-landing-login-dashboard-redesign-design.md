# Landing / Login / Dashboard Redesign

## Context

Zentinel already has a working Marketing landing page (`frontend/src/pages/Marketing.tsx`),
Login page (`frontend/src/components/AuthBrandPanel.tsx` + `frontend/src/pages/Login.tsx`),
and Dashboard (`frontend/src/pages/Dashboard.tsx`), backed by a documented design system
(`DESIGN.md`). This is a full visual overhaul of all three, not a from-scratch build.

## Decisions

- **Brand identity kept**: navy (`#0b1020`) + electric blue (`#2563ff`) accent, Bricolage
  Grotesque typeface, existing color token set in `theme.css`. Overhaul is layout, motion,
  and richness — not a rebrand.
- **Order**: landing page first, then login, then dashboard.
- **Internal app density rule preserved**: per `DESIGN.md`, the dashboard/internal screens
  stay `VISUAL_DENSITY` high / `MOTION_INTENSITY` low — the overhaul upgrades polish
  (motion on mount, chart styling, spacing) without turning it into a decorative, low-density
  marketing-style screen. Landing/Login remain the two screens that get to be bold.
- **No new dependencies** unless a gap appears during build. `motion` (already in
  `package.json`, currently unused) covers all scroll/entrance animation needs via
  `useInView`/`animate`. `recharts` (already installed) covers chart work.

## Landing page (`Marketing.tsx`)

Replace the current single-viewport strip layout with a real scrolling marketing page:

1. **Hero** — keep the Z-mark watermark + split copy/preview-card structure. Add: animated
   gradient glow behind the navy panel, entrance animation on load (`motion.div` fade/slide).
2. **Feature grid** — replace the flat icon strip (`marketing-strip`) with a bento-style
   asymmetric grid: 2 large feature tiles + 4 small ones, scroll-reveal via `useInView`.
3. **Role breakdown** — 4 role cards (Sales/Finance/Ops/Admin), hover-lift, icon + scope list
   (reuses `ROLES` data already in the file, currently just chips in the hero).
4. **Stats strip** — animated count-up numbers (illustrative: leads tracked, invoices raised,
   clients managed, follow-ups automated).
5. **Footer** — expand from the current one-liner to brand mark + a couple of internal links.

## Login (`AuthBrandPanel.tsx` / `Login.tsx`)

- Keep the split-panel structure (brand left, form right, collapses under 860px — existing
  responsive rule stays).
- Add animated gradient mesh / glow to the brand panel (same visual language as the landing
  hero, for brand consistency across the two bold screens).
- Entrance motion on the form panel.
- Polish loading/error states on the form (spinner/shake on invalid credentials).

## Dashboard (`Dashboard.tsx`)

- Keep sidebar shell, fixed-width sidebar, independently-scrolling content — this is an
  explicit `DESIGN.md` rule, not something the overhaul touches.
- Stat cards: motion-in on mount (staggered fade/slide), not on every re-render.
- Charts: richer `recharts` styling — gradients under lines, smoother curves, consistent
  with the landing hero's preview-card chart.
- Empty/loading states: keep mandatory per `DESIGN.md`, restyle to match new visual polish.
- Spacing rhythm tightened to match the more considered landing/login pages.

## Out of scope

- No changes to internal list/table pages (Leads, Clients, Invoices, etc.) — this pass is
  landing + login + dashboard only.
- No new backend routes or data — Dashboard stats already come from existing API.
- No color/brand identity change.
