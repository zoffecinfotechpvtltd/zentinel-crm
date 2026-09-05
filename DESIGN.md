---
name: Zentinel
colors:
  bg: "#f1f5f9"
  bg-elevated: "#ffffff"
  text: "#0b1020"
  text-muted: "#3f4a5f"
  text-subtle: "#64748b"
  border: "#dde4ee"
  accent: "#2563ff"
  accent-strong: "#1c4fd6"
  indigo: "#6366f1"
  primary-navy: "#0b1020"
  success: "#22c55e"
  warning: "#f59e0b"
  danger: "#dc2626"
  info: "#06b6d4"
typography:
  body:
    fontFamily: "Bricolage Grotesque Variable"
    fontSize: 13px
    fontWeight: 400
  heading:
    fontFamily: "Bricolage Grotesque Variable"
    fontWeight: 700
    letterSpacing: -0.015em
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
---

# Design System

## Overview

Zentinel is an internal CRM for Zoffec Infotech — dense operational screens (lead
pipelines, invoices, project boards) used all day by Sales, Finance, Ops, and Admin,
plus two consumer-shaped screens (the marketing landing page and Login) that get to be
bolder since nothing else competes with them there. The two are deliberately different
registers of the same brand, not two products: the internal app should read as
efficient and calm (`VISUAL_DENSITY` high, `MOTION_INTENSITY` low, `DESIGN_VARIANCE`
low — grid-based, predictable, nothing fights the data); the landing/login pair is
where the brand spends its visual boldness (asymmetric split layouts, the navy/blue/
indigo glow, the signature Z-mark watermark).

Light and dark are both first-class — every screen is used long enough that theme
choice matters, and both palettes share the same hue relationships (dark isn't an
inverted afterthought).

## Colors

- **bg / bg-elevated** (#f1f5f9 / #fff): page background vs. raised surfaces (cards,
  modals, inputs). Dark mode: `#0b1020` / `#111827` — same relationship, not just an
  invert.
- **text / text-muted / text-subtle**: three-step hierarchy, never a fourth. Body copy
  uses `text-muted`, primary values/headings use `text`, metadata/timestamps use
  `text-subtle`.
- **accent** (#2563ff) — Electric Blue. The one accent. Every other hue below (indigo,
  success, warning, danger, info, purple, pink, teal) is a *status* color, not a brand
  accent — used only for badges/state, never for a second "brand" gradient.
- **primary-navy** (#0b1020) — reserved for the two places this app spends visual
  boldness: the Login/Setup/Reset brand panel and the Marketing hero. Never used as a
  body-copy background elsewhere (see redesign-skill's "random dark section in a light
  page" anti-pattern — if this ever appears mid-app outside those two contexts, it's a
  bug, not a variant).
- Status colors always pair with their `-soft` background variant (e.g.
  `success-soft`) for badges, banners, and chips — never the solid color as a fill
  behind text at body size.

## Typography

Single family (Bricolage Grotesque, variable) — a distinctive grotesque at heading
weights, clean and neutral at body sizes. Hierarchy comes from weight and tracking,
not a second face:

- **Headings / stat values** (`.page-title`, `.card-title`, `.stat-value`): weight 700,
  letter-spacing -0.015em.
- **Body**: weight 400-500, 12-14px depending on density (dense tables run 12-12.5px;
  page copy runs 13-14px).
- **Numeric columns** (money, counts): `.mono` class — tabular figures, so amounts
  align in a column instead of jittering per-digit-width.
- Loading/saving states end in an ellipsis ("Saving…"), not three periods.

## Layout

- **Internal app** (`.app-shell`, `.main`, `.content`): fixed left sidebar (232px),
  content area scrolls independently — the dashboard shell itself doesn't scroll.
  List pages use infinite scroll (`useInfiniteFetch` + `<InfiniteScrollSentinel>`), not
  pagination — no page-number UI anywhere in the product.
- **Marketing / Login**: the one place the internal app's density rules don't apply.
  Marketing is locked to exactly one viewport (`100dvh`, no scroll — see Marketing.tsx);
  Login/Setup/Reset use the shared split-panel `AuthBrandPanel` (brand left, form
  right, collapses to form-only under 860px).
- Cards (`.card`) carry a border + subtle shadow, not a hard drop shadow — used for
  containment, not decoration. A table inside a card gets `padding: 0` on the card
  itself so the table's own borders read as the card's edge.
- Empty states (`.empty` + an icon) and skeleton loaders (`TableSkeleton`) are
  mandatory on every list/table — a blank white table body while loading, or a bare
  "no rows" with nothing else, is a bug.

## Components

- **Buttons**: `.btn-primary` (solid accent, one per view max — the single most
  important action), `.btn-ghost` (bordered, everything else). No default browser
  button anywhere.
- **Inputs**: custom-built `CustomSelect`/`CustomDatePicker` (not native `<select>`)
  for consistent styling across both themes; native `<input>` for text/number/date
  with the shared `.form-input` treatment.
- **Icon-only buttons** (`.icon-btn`) must carry an accessible label — a bare icon with
  no `aria-label`/`title` is not shippable (this is the audit's #1 recurring finding —
  see the audit report).
- **Badges** (`<Badge status=.../>`): status-colored text on the matching `-soft`
  background, pill-shaped, one per status value.
- **Notifications/toasts**: left-border-colored by severity (`success`/`error`/`info`),
  never a modal for a transient message.

## Do's and Don'ts

- Do keep the internal app visually quiet — density and legibility beat decoration on
  every screen that isn't Marketing/Login.
- Do give every icon-only control an `aria-label`.
- Do use `.mono`/tabular-nums for any column of numbers users compare down a table.
- Don't introduce a second accent hue — status colors are not brand colors.
- Don't add `primary-navy` as a background outside the two auth-adjacent screens.
- Don't ship a list without a loading skeleton and an empty state.
- Don't reach for a modal when an inline/slide-over edit would do.
