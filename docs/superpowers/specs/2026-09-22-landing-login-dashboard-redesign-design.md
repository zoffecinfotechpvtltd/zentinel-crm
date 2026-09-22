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

**Correction (post-review):** the original draft of this section proposed replacing the
single-viewport layout with a multi-section scrolling page. That contradicted DESIGN.md's
own documented rule — "Marketing is locked to exactly one viewport (100dvh, no scroll —
see Marketing.tsx)" — which predates this redesign and was never meant to change. After
seeing a screenshot of the in-progress scrolling build, the correct call was made: keep
the single 100dvh/100vw viewport, no page scroll, ever.

Final scope, implemented:

1. **Hero** — kept the existing Z-mark watermark + split copy/preview-card structure as-is
   (content, layout, role chips, preview card all unchanged). Added: a third animated
   radial-gradient glow layer (`.marketing-hero-glow`, `@keyframes marketing-glow-drift`,
   16s drift) behind the navy panel, plus `motion.div` entrance animation (fade/slide) on
   the hero copy and hero visual on load.
2. **Feature strip** — left as the existing compact `marketing-strip` row, unchanged (no
   bento grid — that would have forced scroll).

Explicitly NOT implemented (would have broken the no-scroll constraint): bento-style
feature grid, role-breakdown cards, animated stats strip, expanded footer. These remain
good ideas for a *separate* page (e.g. an internal "About/Help" page) but do not belong
on the single-viewport marketing landing page.

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
