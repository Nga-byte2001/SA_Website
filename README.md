# Cabinet Odyssey 2026–2027

Official website for the St. Stephen's College Students' Association, Cabinet No.1 Odyssey.

## Assets

Place the following files in the `assets/` folder:

| File | Description | Recommended Size |
|------|-------------|-----------------|
| `banner.jpg` | Hero banner background image | 1920×1080px, landscape |
| `logo.png` | Cabinet Odyssey square logo artwork (historical filename; JPEG content) | 1030×1030px |
| `favicon.ico` | Browser tab icon | 32×32px |

## Development

This is a static five-page site. No build step is required.

- `index.html` — Campaign overview, events, cabinet, and documents
- `services.html`, `activities.html`, `campus.html`, `joint-school.html` — Policy detail pages
- `assets/css/odyssey-ui.css` — Shared responsive layout, type, materials, states, and motion
- `assets/js/odyssey-ui.js` — Shared menu, focus, image fallback, and reveal behavior
- Deploy via GitHub Pages (Settings → Pages → Deploy from branch → `main`)

## Tech

- Semantic HTML
- Shared CSS with reduced-motion, reduced-transparency, high-contrast, and forced-color support
- Small dependency-free JavaScript interaction layer
- Google Fonts (Cormorant Garamond, DM Sans, Noto Serif TC)
