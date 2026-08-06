# Brand & Theme System

## What I found researching zoffec.com

Zoffec Infotech is a Mumbai-based cybersecurity/managed-IT firm (est. 2018), positioned around governance-risk-compliance and enterprise security frameworks — SEBI CSCRF, RBI, IRDAI, DPDP Act, GDPR, ISO 27001, PCI-DSS. Their tagline is **"Epitome of Integrity"**, and their site language is consistently formal, framework-literate, and outcome-oriented ("Assess. Implement. Manage.", "Monitor → Defend → Assure → Validate → Lead"). This is B2B enterprise-security marketing tone: precise, unembellished, credibility-first — not startup-playful, not consumer-friendly.

**Caveat on colors/fonts:** I could read the site's text content and structure via search/fetch, but not pull computed CSS (hex values, exact font-family) directly — that requires rendering the live page, which I don't have access to here. Two concrete signals I *did* find: their downloadable brochure is literally named `ZIRedBrochure.pdf` (a strong hint that red/crimson is a deliberate brand accent, typical of security-firm branding — red reads as "threat/alert/defense"), and the overall tone/sector strongly matches the deep-navy-plus-alert-red convention used across enterprise cybersecurity brands (Palo Alto, CrowdStrike, Fortinet-adjacent positioning — Zoffec resells Fortinet/Sophos/Kaspersky, so their visual world already lives adjacent to these).

**Before implementing, have someone pull the actual hex values and font names from zoffec.com's rendered CSS or brand guide (right-click → inspect, or ask their marketing contact) and drop them into the token list below — treat the values here as a well-reasoned starting point, not a pixel-verified match.**

## Design direction: refine, don't replace

The prototype's dark theme is already the right *category* of design for an internal ops tool used all day (dark reduces eye strain, and it already signals "serious enterprise tool" rather than "consumer app"). Keep its structure — the neutral scale, spacing, card/table patterns, badge system — and make two changes:

1. **Swap the generic SaaS blue (`#4f8ef7`) for a Zoffec-appropriate primary + accent pairing.** `#4f8ef7` is a stock "Bootstrap/Tailwind blue" used by thousands of dashboards — it doesn't say "Zoffec," it says "template." Replace it with a deep, desaturated navy as the structural primary (echoes enterprise security without being loud) and reserve a red/crimson as the deliberate accent for calls-to-action, "live/active" states, and anything that should draw the eye — consistent with the red-brochure signal.
2. **Upgrade typography from generic `system-ui` to a typeface pairing that reads as technical/precise**, matching a firm whose entire pitch is precision and compliance rigor.

## Refined CSS custom properties

Drop-in replacement for the prototype's `:root` block — same variable names, so no other CSS needs to change:

```css
:root{
  /* neutrals — kept close to the prototype, slightly cooler/darker for contrast with navy accent */
  --bg:#0c0f16;--bg2:#131826;--bg3:#1a2133;--bg4:#212a40;
  --text:#eaecf2;--text2:#9aa3ba;--text3:#66708a;
  --border:#262f47;--border2:#38456a;

  /* brand: deep navy primary, red accent (replace with verified brand hex when available) */
  --accent:#c3202f;      /* Zoffec red — primary CTA, active nav, focus rings */
  --accent2:#a11826;     /* hover/pressed state of accent */
  --primary-navy:#1e3a6e; /* structural brand navy — used sparingly: header strip, logo mark, key headings */

  /* status colors — unchanged from prototype, they're already correct semantically */
  --success:#22c55e;--warning:#f59e0b;--danger:#ef4444;--info:#3b82f6;
  --purple:#a855f7;--orange:#f97316;
}
body.light{
  --bg:#f7f8fa;--bg2:#ffffff;--bg3:#f1f3f7;--bg4:#e4e8f0;
  --text:#0f1420;--text2:#4a5470;--text3:#8891a8;
  --border:#e2e6ef;--border2:#ccd3e3;
  --accent:#b81b29;--accent2:#951622;--primary-navy:#1e3a6e;
}
```

Notes:
- `--danger` and `--accent` are now close in hue (both red-family). Keep them visually distinct in practice: `--accent` (Zoffec red) is used for brand/action elements (primary buttons, active nav border, logo dot); `--danger` stays reserved strictly for destructive/error/overdue states. Don't let the two bleed into each other — if this feels confusing in review, shift `--accent` slightly toward maroon (`#9e1b2b`) to separate it further from `--danger`'s `#ef4444`.
- `--primary-navy` is a new token, not in the original prototype — use it for the sidebar logo mark background, the login screen, and section dividers where you want "institutional" weight rather than "click me" energy.

## Typography

Replace the body font stack:

```css
body{
  font-family:'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
/* headings and stat numbers: slightly heavier, tighter tracking for an authoritative feel */
.section-title, .stat-value, .modal-title, .logo-name {
  font-family:'Inter', sans-serif;
  font-weight:650;
  letter-spacing:-0.01em;
}
/* invoice numbers, IPs, IDs, dates in tables: monospace reinforces "this is precise data" */
.mono, td.mono, .stat-value[data-numeric] {
  font-family:'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace;
  font-feature-settings:'tnum';
}
```

- **Inter** (Google Fonts, free, self-hostable) reads as clean/technical without being cold — the standard choice for serious B2B SaaS and close enough to what enterprise security vendors converge on. If Zoffec's actual brand guide specifies a different typeface (many Indian enterprise firms use **IBM Plex Sans** for a slightly more "compliance report" feel), swap it in — the CSS structure above doesn't change either way.
- Apply the `.mono` class to: invoice numbers (`ZI-2025-001`), amounts in tables, dates, and any client-facing reference IDs. This is a small detail that makes a finance tool feel trustworthy — tabular figures should visually align.
- Import once, self-hosted preferred over Google Fonts CDN for an internal tool (avoids an external network dependency for daily-use software): `@font-face` the woff2 files, or fall back to CDN if self-hosting isn't set up yet.

## Small brand touches worth adding (not in the prototype)

- **Login screen** uses `--primary-navy` as a full-bleed background with the Zoffec logo mark centered — first thing anyone sees, worth the ten minutes to make it feel deliberate rather than default.
- **Sidebar logo dot** (currently a plain blue circle) — recolor to `--accent` (red), matching the actual Zoffec mark's likely accent use.
- Keep the badge system, progress bars, and card layout exactly as-is — they're well-designed and don't need brand-driven changes, only the accent color swap already covered by the token change above.
