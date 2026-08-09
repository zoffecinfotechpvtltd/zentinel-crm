# Zentinel brand assets

Hand-vectorized from the client's brand sheets (no source Figma/AI file was
provided — only flattened preview images). Cross-checked against three
separate brand-sheet exports; where they disagreed, went with the values
that matched what two of the three sheets (and the already-shipped theme)
agreed on.

## Files

- `mark-color.svg` — primary icon, transparent background, brand gradient.
  Same artwork as `frontend/public/icon.svg` (that copy has the rounded
  navy app-icon background baked in for the favicon/PWA icon; this one
  doesn't, for dropping onto any surface).
- `mark-monochrome.svg` — single-color outline (`currentColor`), for
  contexts that can't render the gradient: print, watermarks, embossing.
- `lockup-horizontal-{dark,light}.svg` — icon + wordmark, for docs,
  email signatures, or anywhere outside the React app (`Logo.tsx` is the
  source of truth inside the app itself).

## Decisions locked in

- **Typography: Satoshi**, not Inter. Two of the three brand-sheet
  exports specify Satoshi; the third (an alternate concept board) says
  Inter. Satoshi was already wired up in `index.html` via Fontshare and
  is what the live app uses — kept it.
- **Tagline: "Intelligent. Protected. Connected."**, not
  "Smart | Secure | Connected." — same reasoning: majority of the
  sheets, and already shipped in `AuthBrandPanel`/`Marketing`.
- **Palette** — unchanged, already exact-matches one of the sheets:
  Midnight `#0B1020`, Graphite `#111827`, Electric Blue `#2563FF`,
  Indigo `#6366F1`, Cyan `#06B6D4`, Violet `#A855F7`, Slate `#64748B`,
  Light `#F1F5F9`. See `frontend/src/theme.css` for how these map to
  CSS variables in light/dark mode.
