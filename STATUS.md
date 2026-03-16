# FlipOps — Project Status

Last updated: 2026-03-16

## Current version: 0.16.11
## Status: Active development

---

## Deployment

| Layer | URL | Platform |
|---|---|---|
| Frontend | https://rom946.github.io/FlipOps/ | GitHub Pages |
| Backend | https://flipops.onrender.com | Render (free tier) |
| Auto-deploy | On push to `main` (frontend only) ✅ | GitHub Actions |

**Backend keep-alive:** UptimeRobot pings every 5 min to prevent Render cold starts.

---

## What's working ✅

### Core features
- Firebase Auth (email/password + Google OAuth)
- Search & Analyze: paste Wallapop URL → AI deal analysis, recommended buy price, market insight; "Find similar" button opens Discovery pre-loaded with 6 AI-generated search variants from the same Claude response
- Smart URL extraction from mobile share text (strips UTM params, normalizes domain)
- Duplicate URL detection before submitting a search (checks pipeline localStorage)
- Auto-submit with 800ms debounce after URL paste + cancel button
- Negotiation Helper: AI messages in Spanish, 3 tones, configurable max buy price, multi-tab display
- Listing Generator: AI-generated resale descriptions from deal data
- Discovery Engine: multi-platform search (Wallapop/Vinted/Milanuncios/eBay ES), AI scoring, pagination, saved/recent searches, discard items, per-platform result counts; Vinted uses direct REST API with DDG fallback; eBay ES uses RSS feed with DDG fallback; Milanuncios uses direct HTML scrape with Google fallback
- Deal Pipeline: Kanban board (Watching → Negotiating → Bought → Listed → Sold), add/edit/delete, localStorage persistence
- Pipeline bulk status update: select multiple deals, apply status in one action
- Dashboard: P&L metrics, Chart.js charts, CSV export, sold deal list
- Appointments: create/edit/delete (inspection, handover, meeting), Google Calendar sync, deal linking, Google Maps directions
- Home: stats strip, hero, feature cards, next 5 events sidebar
- Getting Started section on Home: 5-step strip, dismissible, persisted to localStorage
- Keyword Variants: user-defined keyword expansion groups stored in Firestore; 9 AI defaults seeded on first use; managed in Settings → "Keyword Variants" tab (toggle, edit chips inline, delete, add new)
- Platform preferences: per-user toggles for Wallapop/Vinted/Milanuncios/eBay Spain; managed in Settings → "Search Platforms" tab; auto-saves with toast; defaults seeded on first login
- Discovery platform chips: 4 platform chips shown above search form; disabled ones greyed out with link to Settings; session-only re-enable by clicking
- Discovery: auto-matches typed keyword to variant triggers; expands to full chip list for search; session-editable chips with "Save to Settings" persistence; falls back to `[kw, kw + " segunda mano", ...]` when no match
- How-To guide: 8 sections, clickable cards navigate to feature pages
- Counter-Offer Calculator: floating button, dual-mode (selling/buying), live margin calculation, minimum counter at 25/30/35% with caps, buying mode verdict (✅/⚠️/❌)
- PlatformBadge: colored pill showing source platform (wallapop/vinted/etc.) on Discovery results and Pipeline deals
- i18n: EN / ES / CA with language persistence via localStorage
- Mobile bottom nav, 44px touch targets, mobile-safe layout
- SPA routing on GitHub Pages (404 redirect + restore)
- Admin/Management page (admin role only)
- Pre-authorization: admin can pre-grant AI access by email before user signs up; consumed on first sign-in

### Infrastructure
- GitHub Actions: Vite build with secrets injection → gh-pages branch
- Render: gunicorn, Firebase Admin SDK via Secret File, CORS whitelisted
- `.claudeignore` and `CLAUDE.md` for AI-assisted development
- `@flipops-map` JSDoc/comment navigation blocks at L1 of `DiscoveryView.jsx`, `AdminDashboard.jsx`, `backend/services/search_provider.py`, `backend/services/usage_tracker.py`, `backend/routes/user.py`, `backend/routes/negotiate.py`, `backend/routes/search.py`

---

## In progress 🔄

- **Multi-provider personal search keys** (complete): all backend + UI done including usage tracking and usage display UI.
- **Discovery result quality** (complete v0.16.6): dead listing detection, Milanuncios URL fix, freshness filter, Scrapingdog priority, no-price items sent to AI with `investigate` verdict.
- **Milanuncios direct scraper** (complete v0.16.7): bypasses Google for Milanuncios; direct HTML scrape with multi-selector fallback; falls back to Google if < 3 results.

---

## Known limitations ⚠️

- **Wallapop API blocked by Akamai** — backend uses `curl_cffi` to impersonate a browser; may break if Akamai updates fingerprinting. No official API available.
- **Claude API balance** — not readable via API key alone (Anthropic doesn't expose this endpoint); balance must be checked on the Anthropic console.
- **Render free tier cold starts** — instance spins down after ~15 min of inactivity; UptimeRobot mitigates but does not eliminate cold starts for first real request.
- **Pipeline stored in localStorage** — data is device-local; no cloud sync, no cross-device access, no backup.
- **Google Calendar sync** — appointments sync to Google Calendar but there is no two-way sync (external changes are not pulled back).
- **Firebase free tier** — Firestore and Auth subject to Spark plan limits.

---

## Known bugs 🐛

*(Add entries here as they are discovered.)*

---

## Tech debt 📋

- `usePipeline` hook stores all deal data in `localStorage` — no server persistence, no conflict resolution if localStorage is cleared.
- Backend `curl_cffi` Wallapop scraping is fragile; any change to Wallapop's bot protection could break search and discovery.
- `VITE_API_URL` is injected at build time — a full rebuild is required to change the backend URL.
- Render free tier: backend may be slow on first request after inactivity despite UptimeRobot (ping interval vs. spin-down timing gap).
- `firebase` npm package is v12 — major version; ensure no breaking changes if updating other packages.

---

## Dependencies health

### Frontend (key packages)
| Package | Version |
|---|---|
| react | ^18.2.0 |
| react-router-dom | ^6.22.3 |
| vite | ^5.2.0 |
| firebase | ^12.10.0 |
| i18next | ^25.8.18 |
| react-i18next | ^16.5.8 |
| i18next-browser-languagedetector | ^8.2.1 |
| chart.js | ^4.4.2 |
| react-chartjs-2 | ^5.2.0 |
| lucide-react | ^0.378.0 |
| tailwindcss | ^3.4.3 |

### Backend (key packages)
| Package | Version |
|---|---|
| flask | 3.0.3 |
| flask-cors | 4.0.1 |
| anthropic | 0.31.2 |
| firebase-admin | 6.5.0 |
| gunicorn | 22.0.0 |
| beautifulsoup4 | 4.12.3 |
| curl_cffi | 0.14.0 |
| google-api-python-client | 2.128.0 |
| requests | 2.32.3 |

---

## Next up

*(Fill in manually when planning next sprint.)*
