# Changelog

All notable changes to FlipOps are documented here.
Format: [keepachangelog.com](https://keepachangelog.com/en/1.0.0/)
Versioning: [semver](https://semver.org/)

## [Unreleased]

## [0.17.0] - 2026-03-16
### Added
- `backend/routes/admin.py`: `GET /api/admin/app-config` and `PATCH /api/admin/app-config` — reads/writes `config/app_settings` Firestore doc with `_DEFAULT_APP_CONFIG` fallback; PATCH accepts `{section, data}` and merges
- `frontend/src/hooks/useApi.js`: `getAppConfig()` and `updateAppConfig(section, data)` methods
- `frontend/src/pages/AdminDashboard.jsx`: "App Settings" admin tab — 4 collapsible sections (Discovery, Providers, AI, Negotiation defaults); per-section Save button with spinner + success state; provider priority reorder with ←/→ buttons; provider enable/disable toggles; lazy-loads on tab activation

## [0.16.15] - 2026-03-16
### Fixed
- `backend/routes/search.py`: added `CITY_COORDINATES` dict for 7 Spanish cities; both `/api/geocoder` and `discover_listings()` now check hardcoded coords before calling Photon/Nominatim — fixes Barcelona returning Brazilian coordinates (lat=-5.95, lon=-35.92)

## [0.16.14] - 2026-03-16
### Changed
- `backend/services/search_provider.py`: variants capped 3→2; platforms capped at 2; Phase 1 now tries only highest-priority provider per query, falls back to second only on 0 results within budget; 25s time budget with `[DISCOVERY] Time budget exceeded` early exit; start/completion logs added
- `backend/routes/search.py`: enrich cap 8→6; removed unused `os` and `get_db` imports

## [0.16.13] - 2026-03-16
### Changed
- `backend/services/search_provider.py`: removed all ThreadPoolExecutor/parallel execution — Phase 1 (serper+serpapi) now runs sequentially with 0.5s sleep between calls; keyword variants capped at 3 (was 5); logs `[SEARCH] Processing 3/X variants (capped for memory)`
- `backend/routes/search.py`: replaced all three ThreadPoolExecutor blocks with sequential loops — enrich step capped at 8 URLs with 0.3s sleep; scrape_step4 sequential; DDG platform loop sequential; `gc.collect()` called at request entry

## [0.16.12] - 2026-03-16
### Fixed
- `frontend/index.html`: removed trailing slash from `/FlipOps/` in SPA redirect handler — 404.html encodes path as `?p=/discovery` (leading `/`), so base must be `/FlipOps` (no trailing slash) to avoid `/FlipOps//discovery` double-slash

## [0.16.11] - 2026-03-16
### Changed
- `render.yaml`: gunicorn start command updated to `--workers 1 --threads 2 --timeout 60 --max-requests 100 --max-requests-jitter 10` — prevents memory leaks via periodic worker restart

## [0.16.10] - 2026-03-16
### Fixed
- `backend/services/search_provider.py`: capped Phase 1 ThreadPoolExecutor to `MAX_CONCURRENT_SEARCHES=3` workers (was up to 20) to prevent SIGKILL on Render 512MB free tier
- `backend/routes/search.py`: reduced Wallapop enrich workers 6→3; reduced scrape_step4 workers 8→3; added 25s global deadline — returns partial results with `timed_out: true` if exceeded, logs `[DISCOVERY] Timeout reached`
- `render.yaml`: added `--timeout 60 --workers 1` to gunicorn start command

## [0.16.9] - 2026-03-16
### Fixed
- `backend/services/scrapers/milanuncios.py`: switched from `requests` to `curl_cffi` (impersonate=chrome110) to fix 405 bot-detection blocks from Milanuncios; retry now uses `chrome124`; non-200 responses log first 300 chars of HTML for diagnosis

## [0.16.8] - 2026-03-15
### Changed
- `backend/services/scrapers/milanuncios.py`: search param changed from `q=` to `s=`; added `orden=relevance` to query; switched to `requests.Session()` for cookie persistence; full browser-like headers replacing minimal headers (Chrome/122 UA, Sec-Fetch-*, Cache-Control, Accept-Encoding); added `_HEADERS_RETRY` with Linux Chrome UA; 403 now waits 2s and retries once with alternate UA before falling back to Google; 0-results path logs response status + first 500 chars of HTML; CSS selectors updated (`article.ma-AdCard` added as first candidate, `div[class*="adcard"]` replaces bare `[class*="adcard"]`); `item_id` extraction now requires match (skips card if no match instead of using filename fallback)

## [0.16.7] - 2026-03-15
### Added
- `backend/services/scrapers/milanuncios.py`: new `search_milanuncios(keywords, max_results=20)` — direct HTML scrape of Milanuncios search page; multi-selector fallback strategy (`_CARD_SELECTORS`); validates URLs against `-\d{6,}\.htm$` pattern; returns standard discovery result dicts with `search_provider: "direct"`
- `search.py` `ANCHOR:direct_api_always`: Milanuncios direct scrape runs before Google providers; if >= 3 results, milanuncios is added to `skip_provider_platforms` and skipped in Google provider search; falls back to Google if < 3 results
- `search.py` `ANCHOR:provider_search`: `provider_platforms` now filters out `skip_provider_platforms` to avoid duplicate Google searches for platforms already served by native scrapers
- `CLAUDE.md`: added `backend/services/scrapers/milanuncios.py` to key files map

## [0.16.6] - 2026-03-15
### Fixed
- `search.py` LISTING_URL_PATTERNS: milanuncios pattern changed from `/\d+\.htm$` to `-\d{6,}\.htm$` to match actual listing URL format
- `search.py` `scrape_item()`: 404/410 responses now return `{"dead": True, "dead_reason": "not_found"}` instead of `None`; sold/reserved detection uses new `is_listing_available()` and returns `{"dead": True, "dead_reason": "sold_reserved"}`
- `search.py` enrich block: dead items removed from `all_results`; truncated URLs (ending `...` or len < 30) skipped before enrichment; summary log added (`[ENRICH] Summary: X live, Y dead (Z sold/reserved, W not found), V no-price`)
- `search.py` enrich block: freshness filter removes Wallapop results older than 14 days using new `_parse_result_date()` helper
- `search_provider.py` `search_serpapi` and `search_serper`: added `date` field to result dicts (used by freshness filter)
- `search_provider.py` `search_with_personal_keys`: Scrapingdog now runs sequentially with 1.5s delay; only called when Serper+SerpAPI returned < 3 results for that (platform, variant) pair; Serper+SerpAPI still run in parallel (Phase 1)
- `negotiate.py` `/api/batch-analyze`: removed price filter — all items now sent to Claude including no-price ones; batch prompt updated with `verdict:"investigate"` and score cap 60 for null-price items; removed `merge_filtered` block; `import time` added to `search_provider.py`
### Added
- `search.py` `is_listing_available(html_text, next_data)`: checks `__NEXT_DATA__` flags/state and HTML markers to detect sold/reserved listings
- `search.py` `_parse_result_date(date_str)`: parses relative ("3 days ago") and absolute date strings to `datetime`

## [0.16.5] - 2026-03-15
### Fixed
- **`backend/routes/negotiate.py`** — `max_tokens` increased from 2048 to 4000 in batch-analyze Claude call; prevents JSON truncation when analyzing 10+ items
- **`backend/routes/negotiate.py`** — Added `ANCHOR:price_filter` at `ANCHOR:batch_analyze_entry`: items with no `price` or `listed_price` are split out before the Claude call; logged as `[BATCH] Skipping N items with no price`; added `ANCHOR:merge_filtered` after JSON parse: no-price items merged back as `verdict: "filtered"`, `score: 0`, `reason: "No price available — listing could not be enriched."` before `return jsonify(final_results)`

## [0.16.4] - 2026-03-15
### Changed
- **`backend/routes/negotiate.py`** — Removed `MAX_BATCH_SIZE = 5` constant and the `if len(items) > MAX_BATCH_SIZE` cap block from `ANCHOR:batch_analyze_entry`; all items sent to Claude without truncation; existing item-count log line kept

## [0.16.3] - 2026-03-15
### Fixed
- **`frontend/src/components/CounterOfferCalculator.jsx`** — Outer fixed container now has `pointerEvents: 'none'` so it never intercepts clicks when collapsed; panel div gets `pointerEvents: open ? 'auto' : 'none'` as inline style (conditional) so clicks pass through when collapsed; floating button gets `pointerEvents: 'auto'` to always remain clickable; page elements behind the calculator are no longer blocked when the panel is closed

## [0.16.2] - 2026-03-15
### Changed
- **`backend/services/search_provider.py`** — `PLATFORM_QUERY_TEMPLATES` at `ANCHOR:platform_query_templates`: both wallapop and milanuncios now use `intitle:"{keywords}"` to force keyword into listing title, eliminating parts/firmware/category pages; Milanuncios drops `inurl:.htm` (redundant with intitle:) and adds `"segunda mano"`; `build_platform_query()` strips surrounding quotes from keywords before inserting into `intitle:` and logs `[QUERY] {platform}: {query}`

## [0.16.1] - 2026-03-15
### Fixed
- **`backend/services/search_provider.py`** — Added `split_keywords()` at `ANCHOR:keyword_split`; splits comma-separated keyword variants (max 5) into individual search terms; `search_with_personal_keys()` now runs one query per variant per platform instead of one query with the full joined string; per-platform results deduped by URL and capped at `MAX_PER_PLATFORM=10`; futures tuple extended to `(p, platform, variant)`; log now shows variant in `[SEARCH_PROVIDER]` and error lines
- **`backend/routes/search.py`** — Added `WALLAPOP_REJECT_PATTERNS` list + `is_relevant_wallapop_item(item)` at `ANCHOR:wallapop_reject_patterns`; `is_relevant_result()` at `ANCHOR:relevance_filter` now accepts `item=None` and calls `is_relevant_wallapop_item` for Wallapop URLs; both PATH A and PATH B call sites updated to pass `item`; rejects firmware, placa, tira led, despiece, recambio, repuesto, piezas, spare, board, pcb etc.
- **`backend/routes/search.py`** — `search_ebay_rss()` at `ANCHOR:fn_ebay_rss`: added `LH_ItemCondition=3000` (used only) to RSS URL; added CAPTCHA detection — if response text starts with "Disculpa la interrupción" or contains "captcha", returns `[]` with log

## [0.16.0] - 2026-03-16
### Fixed
- **`backend/routes/search.py`** — PATH A (personal keys) now scrapes Wallapop item pages for price data after search provider results are merged; `ANCHOR:enrich_personal_results` runs 6 parallel workers with 15s timeout; enriches `price`, `title`, `images`, `item_id`, `description`, `condition` in-place; logs per-item result and final `[ENRICH] Enriched N/M items` summary; items with no price are kept (not dropped)
- **`backend/routes/search.py`** — `scrape_item(url, platform)` moved from nested closure inside `discover_listings()` to module-level at `ANCHOR:fn_scrape_item`; accessible to both PATH A enrich step and PATH B DDG scrape loop
- **`backend/routes/search.py`** — Added `[RESPONSE] Items with price: N | without: N` log before PATH A response return

## [0.15.9] - 2026-03-16
### Fixed
- **`backend/routes/search.py`** — `search_vinted_direct()` at `ANCHOR:fn_vinted_direct`: switched to public endpoint with correct headers (`Origin`, `Accept: application/json, text/plain, */*`), removed auth; `order` changed to `newest_first`, `page: 1` added; URL now constructed from `id` + `title_slug`; 401/403 returns `[]` silently with log; item filter changed from `i.get("url")` to `i.get("id")`
- **`backend/routes/search.py`** — `search_ebay_rss()` at `ANCHOR:fn_ebay_rss`: takes only first keyword (`keywords.split(',')[0].strip()`) to avoid XML parse errors from comma-separated multi-keyword strings; URL-encodes query with `urllib.parse.quote`; wraps `ET.fromstring()` in `try/except ET.ParseError` with response-preview log; logs RSS URL and response status
- **`backend/routes/search.py`** — `is_listing_url()` at `ANCHOR:listing_patterns`: replaced `LISTING_PATTERNS` + `_MILANUNCIOS_LISTING_RE` with single `LISTING_URL_PATTERNS` dict using full regex patterns; Vinted requires `/items/\d+`, eBay requires `/itm/\d+`, Milanuncios requires `/\d+\.htm$`; URL stripped of query string before matching
- **`backend/services/search_provider.py`** — Milanuncios query template at `ANCHOR:platform_query_templates`: replaced `inurl:/anuncios/` with `inurl:.htm -inurl:/anuncios-en-` to exclude city index pages (e.g. `/anuncios-en-pamplona/`) and force `.htm` listing URLs

## [0.15.8] - 2026-03-15
### Fixed
- **`backend/services/search_provider.py`** — Removed `vinted` and `ebay_es` from `PLATFORM_QUERY_TEMPLATES` and `PLATFORM_DOMAINS`; added `SEARCH_PROVIDER_PLATFORMS = ["wallapop", "milanuncios"]` at `ANCHOR:search_provider_platforms`; `search_with_personal_keys()` now skips non-search-provider platforms with a log line (e.g. `[PERSONAL KEYS] Skipping vinted — uses native API`)
- **`backend/routes/search.py`** — Restructured `/api/discovery` flow: Vinted API + eBay RSS now run first at `ANCHOR:direct_api_always` regardless of personal key status; personal key check moved inside `try` at `ANCHOR:provider_search`; personal path now merges direct results + provider results and returns platform_counts by platform (not by search_provider name)
- **`backend/routes/search.py`** — Added `_MILANUNCIOS_LISTING_RE = re.compile(r'-\d{6,}\.htm$')` at `ANCHOR:listing_patterns`; `is_listing_url()` now rejects Milanuncios URLs that lack a numeric listing ID (e.g. `/anuncios/ios-iphone.htm` → dropped, `/anuncios/iphone-13-626940484.htm` → kept); dedicated log line `[FILTER] Milanuncios category page dropped`
- **`backend/routes/search.py`** — Added `import re` at module level (required for `_MILANUNCIOS_LISTING_RE`)

## [0.15.7] - 2026-03-15
### Added
- **`backend/routes/search.py`** — Added `_build_provider_status(uid)` helper at `ANCHOR:fn_build_provider_status`; reads Firestore `searchProviders` for the calling user and returns `{ scrapingdog, serpapi, serper }` each with `enabled`, `used`, `limit`, `resets` fields
- **`backend/routes/search.py`** — Both `/api/discovery` response paths (personal keys and admin DDG) now include `provider_status` in the JSON payload; logs `[RESPONSE] Provider status: {...}`
- **`frontend/src/components/ProviderStatusBar.jsx`** — New component: read-only strip showing each provider's status dot (green/amber/red), usage count (`used/limit`), reset cadence, and a right-aligned last-scan summary with per-provider breakdown
- **`frontend/src/pages/DiscoveryView.jsx`** — Added `providerStatus`, `lastScanCounts`, `lastScanTotal` state; set from `data.provider_status` / `data.platform_counts` / `data.results.length` in `handleScan`; renders `<ProviderStatusBar>` below search card when `providerStatus` is non-null
- **`frontend/src/i18n.js`** — Added `discovery.lastScan` key in EN, ES, CA

## [0.15.6] - 2026-03-15
### Fixed
- **`backend/services/search_provider.py`** — Added `PLATFORM_QUERY_TEMPLATES` dict and `build_platform_query()` at `ANCHOR:platform_query_templates`; each platform gets a dedicated query with `site:` + `inurl:` forcing individual listing URLs (e.g. `inurl:/item/` for Wallapop, `inurl:/items/` for Vinted)
- **`backend/services/search_provider.py`** — `search_with_personal_keys()` now loops per platform (`ANCHOR:personal_keys_per_platform`): builds one `build_platform_query()` string per platform, runs all active providers × all platforms in parallel via `ThreadPoolExecutor`; each platform gets `per_platform = max(2, num // len(platforms))` results; usage tracked once per provider (not once per platform × provider)
- **`backend/routes/search.py`** — `is_listing_url()` already correctly wired into `is_relevant_result()` — confirmed no change needed; category pages (e.g. `/moviles-telefonos/`, `/b/`, `/catalog/`) are blocked before reaching listing-URL check

## [0.15.5] - 2026-03-15
### Fixed
- **`backend/routes/search.py`** — Added `LISTING_PATTERNS` dict and `is_listing_url()` at `ANCHOR:listing_patterns`; rejects category/browse pages (e.g. `/b/`, `/catalog/`, `/moviles-telefonos/`) for all marketplace domains; called from updated `is_relevant_result()`
- **`backend/routes/search.py`** — Added `/b/`, `/catalog/`, `/brand/`, `/moviles-telefonos/`, `/bn_` to `BLOCKED_PATTERNS` to catch category URL shapes before domain check
- **`backend/routes/search.py`** — `ANCHOR:personal_keys_check`: passes `location` from request payload to `search_with_personal_keys()` (as `None` when empty string); adds `[SEARCH] Location passed` log
- **`backend/services/search_provider.py`** — `build_scoped_query()` now accepts optional `location` param; appends it to the scoped query when provided (e.g. `"iPhone 13 (site:es.wallapop.com OR site:vinted.es) Barcelona"`)
- **`backend/services/search_provider.py`** — `search_scrapingdog()`, `search_serpapi()`, `search_serper()` now accept and pass `location` to `build_scoped_query()`
- **`backend/services/search_provider.py`** — `search_with_personal_keys()` now accepts `location` param, logs it at `ANCHOR:personal_keys_entry_log`, and passes it to each provider via executor submit

## [0.15.4] - 2026-03-15
### Fixed
- **`backend/services/search_provider.py`** — Added `PLATFORM_DOMAINS` dict and `build_scoped_query()` helper (`ANCHOR:platform_domains`); builds `keyword (site:es.wallapop.com OR site:vinted.es OR ...)` query scoped to enabled platforms
- **`backend/services/search_provider.py`** — `search_scrapingdog()`, `search_serpapi()`, `search_serper()` now accept `platforms: list = None` param and pass scoped query to API call instead of raw keyword; default to all platforms if not provided
- **`backend/services/search_provider.py`** — `search_with_personal_keys()` now accepts and passes `platforms` down to each provider; logs active providers, platforms, and all merged URLs at `ANCHOR:personal_keys_entry_log` and `ANCHOR:personal_keys_dedup_log`
- **`backend/routes/search.py`** — `ANCHOR:personal_keys_check`: passes `platforms` from request payload to `search_with_personal_keys()`; adds `[SEARCH] Platforms passed to provider` log
### Added (logging only)
- **`backend/services/search_provider.py`** — `[SCRAPINGDOG]`, `[SERPAPI]`, `[SERPER]` logs: scoped query, raw result count, per-URL with title and platform at each provider function

## [0.15.3] - 2026-03-15
### Added (logging only — no logic changes)
- **`backend/routes/search.py`** — `ANCHOR:platform_parallel`: `[DDG]` log per platform with full URL list after DDG collect
- **`backend/routes/search.py`** — `ANCHOR:url_dedup`: `[DEDUP]` log of all URLs after normalization and dedup
- **`backend/routes/search.py`** — `ANCHOR:scrape_step4` / `ANCHOR:og_meta_fallback`: `[SCRAPE]` log per item (method NEXT_DATA vs OG_META, title, price, platform, item_id); `[SCRAPE] ⚠️` on failure
- **`backend/routes/search.py`** — `ANCHOR:direct_api_merge`: `[DIRECT]` log of Vinted and eBay direct API items with URL + title
- **`backend/routes/search.py`** — `ANCHOR:relevance_filter`: per-item `[FILTER] ✅ KEPT` / `❌ DROP` with platform and URL
- **`backend/routes/search.py`** — `ANCHOR:response_return`: `[RESPONSE]` summary + per-result `[RESULT]` with platform, title, URL
- **`frontend/src/pages/DiscoveryView.jsx`** — `ANCHOR:dedup_available`: `[DEDUP]` log of all items before URL dedup with platform, url, item_id
- **`frontend/src/pages/DiscoveryView.jsx`** — `ANCHOR:platform_filter`: `[FILTER]` log of all items before filter + `[FILTER] Dropped items` list if any were dropped

## [0.15.2] - 2026-03-15
### Fixed
- **`backend/routes/search.py`** — Added `ALLOWED_DOMAINS`, `BLOCKED_PATTERNS`, `is_relevant_result()`, `_detect_platform()` module-level helpers; new `ANCHOR:relevance_filter` block drops results from YouTube, Apple, Google, etc. before returning; also fixes items with missing/unknown `platform` field by inferring from URL
- **`backend/routes/negotiate.py`** — Added `extract_json_from_response()` with regex fallback to handle markdown fences and extra text in Claude batch responses; replaced fragile `raw.find('[')`/`rfind(']')` parse; added `print` of raw response (first 300 chars) on every call and full raw on parse failure
- **`backend/routes/negotiate.py`** — Added `MAX_BATCH_SIZE = 5` cap at route entry; large batches are silently truncated with a `[BATCH]` log
- **`backend/routes/negotiate.py`** — Appended `CRITICAL: Respond with a valid JSON array ONLY` enforcement line to end of batch prompt
- **`frontend/src/pages/DiscoveryView.jsx`** — Added `ANCHOR:platform_filter` block after URL dedup in `handleScan`; filters `uniqueAvailable` to `knownPlatforms` domains only; uses `filteredAvailable` in `setListings` and `handleBatchAnalyze` call
- **`frontend/src/pages/DiscoveryView.jsx`** — `handleBatchAnalyze` catch block now sets `error` state with `t('discovery.batchAnalysisFailed')` and marks all listings with `analysis_error: true` so they remain visible without scores
- **`frontend/src/i18n.js`** — Added `batchAnalysisFailed` key under `discovery` namespace in en/es/ca

## [0.15.1] - 2026-03-15
### Changed
- **`backend/routes/search.py`** — Appended ARCHITECTURE, GOTCHAS, DATA FLOW sections to `@flipops-map`; documents PATH A vs PATH B, direct API merge placement gotcha, curl_cffi note, location filter behaviour; no logic changes
- **`frontend/src/pages/DiscoveryView.jsx`** — Appended LISTS, DEDUP BLOCKS, GOTCHAS, ARCHITECTURE sections to `@flipops-map`; documents URL-based dedup, empty item_id gotcha, facebook exclusion, sessionStorage persistence; no logic changes
- **`CLAUDE.md`** — Marked both files as having ARCHITECTURE + GOTCHAS appended to map

## [0.15.0] - 2026-03-15
### Fixed
- **`DiscoveryView.jsx`** — `handleScan` dedup replaced `item_id`-based dedup with URL-based dedup using a `Set`; fixes critical bug where all OG-meta-scraped results (Vinted, Milanuncios, eBay) were collapsed to 1 item due to empty `item_id` (confirmed by `[DEBUG]` log showing "dropped 12")
- **`DiscoveryView.jsx`** — `handleLoadMore` dedup updated to URL-based matching for both `setListings` and `setDiscarded`; consistent with `handleScan` fix
- **`DiscoveryView.jsx`** — Debug log message updated to reflect URL-based dedup: `[DEBUG] After URL dedup: uniqueAvailable:`
### Added
- **`backend/routes/search.py`** — `search_vinted_direct()`: module-level helper that calls Vinted REST API (`/api/v2/catalog/items`); returns full item dicts (title, url, price, images, item_id, seller, location, condition); called before DDG for vinted platform
- **`backend/routes/search.py`** — `search_ebay_rss()`: module-level helper that fetches eBay RSS feed (`/sch/i.html?_rss=1`); parses XML items, extracts price from title/description; returns full item dicts; called before DDG for ebay_es platform
- **`backend/routes/search.py`** — Step 2a in `discover_listings()`: tries Vinted direct API and eBay RSS before DDG; on success removes platform from `ddg_platforms` (skips DDG); on failure falls back to DDG; direct results merged into `listings` after scraping step
- **`backend/routes/search.py`** — Provider logging: `[DISCOVERY] Checking personal keys for uid: ...`, `[DISCOVERY] Using personal providers: [...]`, `[DISCOVERY] No personal keys — using DDG (admin provider)`; diagnoses Task 4 (confirm which key path is being used)
- **`backend/routes/search.py`** — Vinted/eBay direct API print logs: `[VINTED] Direct API returned N results`, `[VINTED] Direct API failed: STATUS`, `[EBAY] RSS status: N`, `[EBAY] RSS returned N items`

## [0.14.4] - 2026-03-15
### Fixed
- **`DiscoveryView.jsx`** — `enabledPlatforms` filter now explicitly excludes `facebook` (both `handleScan` and `handleLoadMore`) and guards against null `platformPrefs`; fixes Issue 1 (stale Firestore `facebook:true` leaking into API calls)
- **`backend/routes/search.py`** — `PLATFORM_FILTERS`: broadened url_patterns for Vinted (`vinted.es/items/` → `vinted.es`), Milanuncios (`milanuncios.com/anuncios/` → `milanuncios.com`), eBay ES (`ebay.es/itm/` → `ebay.es`); fixes Issue 3 (0 results from DDG for non-wallapop platforms)
- **`backend/routes/search.py`** — Added `_PLATFORM_DISPLAY_NAMES` dict and zero-result fallback in `_ddg_collect`: if all site: queries return 0 URLs for a non-wallapop platform, retries with plain `{keywords} {platform_name} segunda mano` query; fixes Issue 3 edge case (ebay_es key is a bad search term)
### Added
- **`DiscoveryView.jsx`** — Debug logging in `handleScan`: `[DEBUG] After status split`, `[DEBUG] After item_id dedup` (shows how many dropped + reason), `[DEBUG] After discarded dedup`; diagnoses Issue 2 (14 results silently dropped by empty `item_id` dedup)
- **`DiscoveryView.jsx`** — Updated `@flipops-map` all handler+JSX anchors corrected (+8 shift from accumulated logging additions)

## [0.14.3] - 2026-03-15
### Added
- **`backend/tests/test_discovery.py`** — Tests 6–11: live provider tests for Scrapingdog (single + bulk), SerpAPI (single), Serper (single), provider comparison summary, plain-query-without-site-filter comparison; all live tests skip via `pytest.skip()` if env key absent; `@flipops-map` added at L1 (N=23 offset, 11 test anchors)

## [0.14.2] - 2026-03-15
### Added
- **`backend/routes/search.py`** — diagnostic `[DISCOVERY]` print statements: entry log (keywords/platforms/page), queries list per platform inside `_ddg_collect`
- **`backend/services/search_provider.py`** — diagnostic `[SEARCH_PROVIDER]` print statements: entry log (uid/query/providers), per-provider result count, post-dedup count
- **`frontend/src/pages/DiscoveryView.jsx`** — diagnostic `console.log` at search trigger, API response (results/errors/counts), listings stored (available/discarded), and `console.error` on catch
- **`backend/tests/test_discovery.py`** — 5 unit tests: DDG single-query URL parse, bulk platform aggregation, URL deduplication (case + query-string), platform URL filter, rate-limit detection

### Fixed
- **`AdminDashboard.jsx`** — `authFetch` now uses `auth.currentUser.getIdToken()` (raw Firebase user) instead of `user.getIdToken()` (context plain object); fixes "user.getIdToken is not a function" error when saving search provider keys

## [0.14.1] - 2026-03-15
### Changed
- Added @flipops-map navigation comment at L1 of `AdminDashboard.jsx` (N=79 offset, 26 state vars, 19 handlers, 12 JSX sections)
- Added @flipops-map navigation comment at L1 of `DiscoveryView.jsx` (N=59 offset, previously completed)
- Added @flipops-map navigation comment at L1 of `backend/services/search_provider.py` (N=20 offset, 5 functions, 4 anchors)
- Updated `CLAUDE.md` Key Files Map with @flipops-map references for all three files
- Added @flipops-map navigation comment at L1 of `backend/services/usage_tracker.py` (N=19 offset, 4 functions, 4 anchors)
- Added @flipops-map navigation comment at L1 of `backend/routes/user.py` (N=26 offset, 15 routes, 4 anchors)
- Added @flipops-map navigation comment at L1 of `backend/routes/negotiate.py` (N=17 offset, 3 routes, 6 anchors)
- Added @flipops-map navigation comment at L1 of `backend/routes/search.py` (N=19 offset, 3 routes, 8 anchors)
- Fixed "Each child in a list should have a unique key prop" warning in `DiscoveryView.jsx`: 6 `.map()` calls updated (4 listing/discarded maps now use `url || item_id`; 2 red_flags maps now use `flag || i`)

## [0.14.0] - 2026-03-15

### Added
- **`backend/routes/negotiate.py`** — `POST /api/analyze-listing`: added `"search_variants": []` to Claude JSON schema; added rule 18 instructing Claude to return exactly 6 short search queries (exact model, lower/higher spec, prev/next gen, broader category); safety: `analysis_data.setdefault` ensures missing/malformed field is coerced to `[]` without failing the response
- **`frontend/src/pages/SearchView.jsx`** — `searchVariants` and `variantsSaved` state; set from `analysisData.search_variants` after each of 3 `analyzeListing` call sites; reset to `[]` on new import; "Find similar" button (yellow, `Search` icon) shown when `searchVariants.length > 0`, renders in both mobile banner and desktop action hub; save-variants inline prompt with `api.createKeywordVariant()` call; success confirmation text
- **`frontend/src/pages/DiscoveryView.jsx`** — `handleScan` accepts optional 4th param `overrideChips`; when set, bypasses variant/expand resolution and uses them directly; mount effect handles `locationRouter.state.preloadedVariants` — pre-fills `keywords`, `sessionChips`, `activeVariantLabel`, then calls `handleScan` with `overrideChips` after 300ms
- **`frontend/src/i18n.js`** — added `search.findSimilar`, `saveVariantsPrompt`, `saveVariants`, `variantsSaved` in en/es/ca

### Planned
- Google Calendar two-way sync for appointments
- Wallapop real API integration (currently blocked by Akamai bot protection)
- Claude API balance display in UI
- Push notifications for deal status changes

---

## [0.13.0] - 2026-03-15

### Added
- **`AdminDashboard.jsx` — Search Providers tab usage display**: per-provider usage block (searches remaining, progress bar green/yellow/red, reset date, low-credit inline warning with top-up link); `searchUsage`/`usageLoading` state; `fetchSearchUsage()` via `authFetch('/api/user/search-usage')`; auto-refresh on mount + every 5 min; refreshes after key save and key remove
- **`DiscoveryView.jsx` — low credit banner**: dismissable amber warning banner shown when `searchUsageSummary.anyLowCredits` is true (from existing `GET /api/user/me` response); dismiss persisted to sessionStorage (`flipops_usage_banner_dismissed`); links to Settings providers tab; `usageSummary`/`bannerDismissed` state added
- **`frontend/src/i18n.js`**: added `settings.searchProviders.remaining`, `total`, `resetsOn`, `neverResets`, `lowCredits`, `topUp` keys (en/es/ca); added `discovery.lowCreditsOne`, `lowCreditsMany`, `topUpLink` keys (en/es/ca)

---

## [0.12.0] - 2026-03-15

### Added
- **`backend/services/usage_tracker.py`** (new): `PROVIDER_LIMITS` for scrapingdog/serpapi/serper; `get_searches_remaining(provider, usage)` calculates estimated remaining searches from credits used; `get_next_reset_date(provider, usage)` returns ISO date of next credit reset (fixed-day for Serper, signup-anniversary for SerpAPI, `None` for never-reset); `_should_reset_monthly(usage)` checks if monthly counters need reset; `increment_usage(uid, provider)` updates `totalRequests`, `totalCreditsUsed`, `monthlyRequests`, `monthlyCreditsUsed`, `lastUsedAt`, `lastResetDate` in Firestore — resets monthly counters when month changes — never raises
- **`backend/services/search_provider.py`**: imported `threading` + `increment_usage`; fires `threading.Thread(target=increment_usage, args=(uid, p), daemon=True).start()` after each successful provider result (non-blocking)
- **`GET /api/user/search-usage`** in `backend/routes/user.py`: returns per-provider `{ hasKey, enabled, totalRequests, totalCreditsUsed, monthlyRequests, freeSearches, searchesRemaining, creditsPerSearch, resetType, nextResetDate, lowCredits }` + top-level `anyLowCredits` / `lowProviders`
- **`GET /api/user/me`**: now includes `searchUsageSummary: { anyLowCredits, lowProviders }` computed from live Firestore usage data

---

## [0.11.0] - 2026-03-15

### Added
- **DiscoveryView — search source badge**: `searchSource` + `activeProviders` state; reset on new scan; populated from `data.source` / `data.active_providers` after API call; renders `🔑 Searching via your {providers}` or `Powered by FlipOps shared search` below platform counts when results are present
- **DiscoveryView — `{/* TODO Prompt B: low credit banner */}`** placeholder above results area
- **i18n**: added `discovery.searchingVia` and `discovery.poweredByFlipOps` to EN, ES, CA

---

## [0.10.1] - 2026-03-15

### Fixed
- **`AdminDashboard.jsx` — Search Providers handlers**: removed `import { auth }` from firebase; destructure `user` from `useAuth()` instead; replaced `_searchKeyFetch(path, method, body)` with `authFetch(path, options)` using `user.getIdToken()` and options-spread pattern matching the corrected spec
- **Handler signatures corrected**: `handleToggle(provider, enabled)` now takes both params directly (was curried); `handleRemove(provider)` is now a direct async function (was curried); JSX call sites updated accordingly (`handleToggle(p, !state.enabled)`, `() => handleRemove(p)`)
- **i18n `openProvider`**: removed trailing ↗ from EN, ES, CA values

---

## [0.10.0] - 2026-03-15

### Added
- **Settings → "Search Providers" tab** (`AdminDashboard.jsx`): visible to all users; shows 3 provider cards (Scrapingdog 🐕, SerpAPI 🔍, Serper ⚡); status badge shows active personal provider(s) or shared fallback
- **No-key card**: numbered setup steps, "Open [name] ↗" button, password input with show/hide toggle, "Save & verify" button (calls `POST /api/user/search-key`, tests key before saving); `closed: true` providers show amber warning instead of steps
- **Key-saved card**: enabled toggle (optimistic), masked key display, added date, last-used date; "Change key" and "Remove key" buttons; `TODO Prompt B` comment for usage stats
- **`PROVIDER_INFO` constant** above component: name, emoji, freeInfo, steps, url, closed per provider
- **`_searchKeyFetch` inline helper**: authenticated fetch using `auth.currentUser.getIdToken()` (avoids editing useApi.js)
- **`refreshUserProfile` helper**: `api.getMe()` → `setUserProfile()`; used after save/remove
- **`changingKey` state**: tracks per-provider "change key" mode to show input form over saved-key view
- **`settings.searchProviders` i18n namespace**: added to `en`, `es`, `ca` in `i18n.js`

---

## [0.9.0] - 2026-03-15

### Added
- **`POST /api/user/search-key`**: validates provider + key length, test-calls the provider with `"iphone"` query (3 results) before saving; stores encrypted key + sets `enabled: true` + `addedAt` in `users/{uid}.searchProviders.{provider}`; returns 400 `key_invalid` if test fails
- **`PATCH /api/user/search-key/<provider>`**: toggles `enabled` flag; returns 400 `no_key` if enabling without a stored key
- **`DELETE /api/user/search-key/<provider>`**: clears `apiKey`, `enabled`, `addedAt` for the provider
- **`GET /api/user/me`**: now returns `searchProviders` (per-provider `{ enabled, hasKey, addedAt, lastUsedAt }`), `activeSearchProviders` (list of enabled+hasKey providers), `usingPersonalSearch` (bool)
- **`POST /api/discovery`**: checks `search_with_personal_keys()` before DuckDuckGo; if personal keys active, returns their results directly with `source: "personal"` and skips DDG entirely; DDG path now returns `source: "admin", active_providers: ["duckduckgo"]`

---

## [0.8.0] - 2026-03-15

### Added
- **`backend/services/search_provider.py`** (new file): `PROVIDER_LIMITS` constant with free-tier limits for scrapingdog/serpapi/serper/duckduckgo; `search_scrapingdog()`, `search_serpapi()`, `search_serper()` functions with `api_key` param + fallback to env var; `_detect_platform()` URL helper; `search_with_personal_keys(query, num_results, uid)` — reads `searchProviders` from Firestore, decrypts keys, runs enabled providers in parallel via `ThreadPoolExecutor`, deduplicates by normalized URL, returns `{ results, source, active_providers }` or `None` if no personal providers active
- **`backend/.env.example`**: added `SCRAPINGDOG_API_KEY`, `SERPAPI_API_KEY`, `SERPER_API_KEY` placeholder entries

---

## [0.7.0] - 2026-03-15

### Added
- **Multi-platform Discovery (Phase 1 — DuckDuckGo)**: `POST /api/discovery` now accepts `platforms: ["wallapop","vinted","milanuncios","ebay_es"]`; runs one DDG search per enabled platform in parallel via `ThreadPoolExecutor`; results tagged with `platform` field
- **`PLATFORM_FILTERS` dict** in `backend/routes/search.py`: maps each platform to its DDG `site:` filter and URL pattern
- **OG meta fallback scraper**: `scrape_item` now falls back to `og:title` / `product:price:amount` / `og:image` when `__NEXT_DATA__` is absent, enabling basic result extraction from Vinted, Milanuncios, eBay ES
- **URL deduplication**: normalized (lowercase, no trailing slash, no query params) before merging across platforms
- **Per-platform error handling**: failed platforms logged and returned as `platform_errors` array; other platforms continue unaffected
- **New response shape**: `{ results: [...], platform_errors: [...], platform_counts: { wallapop: N, ... } }` (frontend handles both old list and new shape via `data.results || data`)
- **Discovery UI — searching text**: scan button shows "Searching Wallapop, Vinted…" with active platform names while loading
- **Discovery UI — counts bar**: per-platform result counts + total shown below search bar after scan completes
- **Discovery UI — error badges**: failed platform names shown as muted pill badges
- **`useApi.js`**: `discover()` now accepts optional `platforms` array (4th param, defaults to `["wallapop"]`)

---

## [0.6.1] - 2026-03-15

### Removed
- **Facebook Marketplace** removed from all platform lists: `DEFAULT_PLATFORM_PREFS` in `AdminDashboard.jsx` and `DiscoveryView.jsx`, `PLATFORMS` array in `AdminDashboard.jsx`, platform chips in `DiscoveryView.jsx`, `PlatformBadge.jsx` config, backend `default_prefs` in `user.py` (both seeding and PATCH route)
- Removed "Facebook Marketplace automated import" from planned features (no scraping ever implemented)
- Removed Facebook Marketplace known limitation from `STATUS.md`

---

## [0.6.0] - 2026-03-15

### Added
- **Pre-authorization system**: new `preauthorized_emails` Firestore collection; admin can grant AI access before a user signs up
- **`GET/POST/DELETE /api/admin/preauthorized`** routes in `backend/routes/admin.py`; POST validates email format, lowercases, rejects duplicates (409); DELETE removes by doc ID
- **AuthContext sign-in flow**: on first Google sign-in, checks `preauthorized_emails` for matching email; if found, sets `hasSharedAccess: true` + `dailyCap` from preauth doc, deletes the preauth doc (consumed), shows 5s welcome toast; if not found, creates user with defaults as before
- **Welcome toast**: rendered inside `AuthProvider` JSX; shows "Welcome! AI access has been pre-configured for you." for 5s on preauth match
- **Admin UI — "Pre-authorized" tab** (`/management`): table of pending pre-authorizations (email, cap, note, relative time, delete ×); inline add form with email + cap + note fields; client-side duplicate check + error display; lazy-loaded on first tab visit
- **`useApi.js`**: added `getPreauthorized`, `addPreauthorized`, `deletePreauthorized` methods

---

## [0.5.2] - 2026-03-15

### Added
- **`PlatformBadge` component** (`frontend/src/components/PlatformBadge.jsx`): colored pill badge with emoji + label for wallapop (amber), vinted (green), milanuncios (blue), ebay_es (red), unknown (gray)
- **Discovery results**: `PlatformBadge` rendered above item title in both desktop table and mobile card views
- **Pipeline rows**: `PlatformBadge` rendered above deal name in both desktop table and mobile card views
- **Backend `POST /api/discovery`**: every result object now includes `"platform": "wallapop"` (hardcoded; only Wallapop is scraped)

### Changed
- Firestore history items and pipeline deals now have a `platform` field (default `"wallapop"`); missing field treated as `"wallapop"` on read — no migration needed

---

## [0.5.1] - 2026-03-15

### Changed
- **CounterOfferCalculator — dual-mode upgrade**: added role toggle ("I am selling" / "I am buying"); switching roles resets all inputs
- **Selling mode**: My listed price + Buyer offer + Target margin + Platform fee inputs; implied buy price muted line; "If you accept" net profit block; Minimum counter block at 25/30/35% targets with caps (holds at listed price if target exceeds it; shows "✅ Offer already meets target" when offer is sufficient)
- **Buying mode**: Seller listed price + Max buy price + Expected resell price + Platform fee + Target margin inputs; "At your max buy" net profit block with margin color-coding; Ideal max buy + Negotiation gap; Verdict badge (✅ Good deal / ⚠️ Borderline / ❌ Too expensive) based on max buy vs ideal max buy ±10%
- Panel uses `max-h-[75vh] overflow-y-auto` for scrollability on small screens

---

## [0.5.0] - 2026-03-15

### Added
- **Platform preferences — Firestore**: `platformPreferences: { wallapop, vinted, milanuncios, ebay_es }` added to `users/{uid}`; all default `true`; seeded automatically on first `GET /api/user/me` if field is missing
- **`PATCH /api/user/platform-preferences`** backend route: updates a single platform flag, returns updated map
- **`GET /api/user/me`** now seeds and returns `platformPreferences` with defaults if missing
- **Settings — "Search Platforms" tab** in `AdminDashboard.jsx`: one card per platform (emoji + name + Active/Disabled status + toggle); auto-saves on toggle via PATCH; toast notification for 3s; syncs from `userProfile` on load
- **Discovery platform chips**: 5 platform chips shown above the search form; reflects `platformPreferences` from `getMe()`; disabled platforms greyed out with "Disabled · Enable →" link to `/management`; user can temporarily re-enable for the session by clicking (no Firestore write)
- **`useApi.js`**: added `updatePlatformPreference(platform, enabled)` method

---

## [0.4.1] - 2026-03-15

### Fixed
- **CounterOfferCalculator**: added `listedPrice > 0` guard so `boughtPrice` is `null` (not 0) when listed price is empty or zero — all derived outputs now show `—` instead of nonsense values
- **CounterOfferCalculator**: `netAfterFee` now correctly guards on `boughtPrice > 0` before computing
- **CounterOfferCalculator**: added "Implied buy price: €XXX" muted line below listed price input so user can sanity-check the derivation
- **CounterOfferCalculator**: `minCounter` returns `null` (→ `—`) instead of 0 when guard fails

---

## [0.4.0] - 2026-03-15

### Added
- **Keyword Variants — backend**: `GET/POST/PATCH/DELETE /api/user/keyword-variants` routes in `backend/routes/user.py`; seeds 9 AI default groups (TV, iPhone, iPad, PlayStation, Nintendo, MacBook, Dyson, Bicicleta, Cámara) on first visit if `keywordVariants` array is empty in Firestore
- **Keyword Variants — Settings UI**: new "Keyword Variants" tab in `AdminDashboard.jsx` (`/management`); per-group cards with read-only chip display, enabled toggle, inline edit mode (click chip to edit, × to remove, Enter to add), delete; "+ Add keyword group" inline form; lazy-loaded on first tab visit
- **Keyword Variants — Discovery integration**: `DiscoveryView.jsx` fetches variants on mount alongside `getMe()`; matches typed keyword case-insensitively against triggers; if matched, uses variant chips as resolved search keywords via `expandKeywords` util; shows yellow "Using your custom variants for X" banner with editable chips; session chip edits show "Save to Settings" button that PATCHes the variant group
- **`expandKeywords.js`** utility: `expandKeywords(keyword, userVariants)` — returns matched variant's chips if found and enabled, else `[keyword, keyword + " segunda mano", keyword + " buen estado", keyword + " ocasión"]`
- **`useApi.js`**: added `getKeywordVariants`, `createKeywordVariant`, `updateKeywordVariant`, `deleteKeywordVariant` methods

---

## [0.3.0] - 2026-03-15

### Added
- **CounterOfferCalculator**: floating 💶 button fixed bottom-right (above mobile nav); slides up a margin calculator panel with listed price, buyer offer, target margin, platform fee inputs; live-calculated net profit, real margin (color-coded green/amber/red), and minimum counter-offer at 25/30/35% targets
- **Getting Started section on Home**: 5-step horizontal scrollable strip (Find a deal → Negotiate → Track it → Relist it → Count your profit); each card navigates to the relevant route; strip is dismissible and preference is persisted to `localStorage`; "Read the full guide" button links to `/howto`
- **HowToView clickable cards**: every section card now navigates to its corresponding route on click using React Router `navigate()`; added `ChevronRight` arrow and hover state

### Changed
- `Layout.jsx` now renders `CounterOfferCalculator` globally (available on all authenticated pages)

---

## [0.2.0] - 2026-03-15

### Added
- **i18n — Catalan (CA) language**: full translation for all namespaces including `home`, `appointments`, `pipeline`, `howto`, `search`, `negotiate`, `listing`, `dashboard`, `discovery`, `management`
- **i18n — language persistence**: `i18next-browser-languagedetector` now configured with `supportedLngs: ['en', 'es', 'ca']` and `detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] }` to survive page reload
- **Smart URL extraction on Search paste**: `extractWallapopUrl.js` utility parses arbitrary text (e.g. mobile share text) to extract and normalize Wallapop URLs; strips UTM params, normalises `wallapop.com` → `es.wallapop.com`
- **Auto-submit on Search**: 800ms debounce after URL paste with a cancel button
- **Duplicate URL detection on Search**: checks pasted URL against all deals in localStorage pipeline before submitting; shows inline warning with deal title if duplicate found
- **Pipeline bulk status update**: select mode with checkboxes, floating bulk action bar above mobile nav; apply a new status to multiple deals at once
- **Mobile CSS layer**: `.table-scroll-wrapper`, `.stack-mobile`, `.main-content` safe area, 44px minimum touch targets, modal utilities — all scoped to `@media (max-width: 480px)`
- **Appointments page i18n**: all hardcoded strings replaced with `t()` calls; `TYPE_LABELS` moved inside component; filter map variable renamed from `t` to `filterType` (was shadowing the translation function)
- **Home page i18n**: all hardcoded strings replaced with `t()` calls; `FEATURE_CARDS` use `titleKey`/`descKey`/`tagKey` keys

### Fixed
- Catalan translations missing `home` and `appointments` namespaces — added both
- `t` variable shadow in `AppointmentsPage` filter map causing translation function to break

---

## [0.1.0] - 2026-03-15

### Added
- **Firebase Authentication**: email/password + Google OAuth login; `AuthContext` with `useAuth` hook; `ProtectedRoute` guard on all pages
- **Search & Analyze** (`/search`): paste a Wallapop URL; backend imports listing via `curl_cffi`; Claude AI scores the deal and returns market analysis, recommended buy price, and negotiation angle
- **Negotiation Helper** (`/negotiate`): AI-generated negotiation messages in Spanish; tone selector (Friendly / Firm / Curious); configurable max buy price; multi-tab result display; copy to clipboard
- **Listing Generator** (`/listing`): AI-generated resale listing descriptions from deal data; copy to clipboard
- **Discovery Engine** (`/discovery`): keyword + location search across Wallapop; AI scores and ranks results; pagination; saved and recent searches; discard/filter individual listings
- **Deal Pipeline** (`/pipeline`): Kanban board with columns: Watching → Negotiating → Bought → Listed → Sold; add/edit/delete deals; deal fields: product, initial price, target buy, actual buy, target sell, URL, notes; data persisted to `localStorage` via `usePipeline` hook; default target sell = `Math.round(price × 1.35 / 5) × 5`
- **Dashboard** (`/dashboard`): P&L metrics (total profit, active deals, avg margin, watching count); Chart.js bar and line charts for sold deals; CSV export; date-filtered sold deal list
- **Appointments** (`/appointments`): create/edit/delete appointments (inspection, handover, meeting); Google Calendar sync; deal linking; location with Google Maps directions link; home page preview of next 5 events (click to navigate, double-click to edit)
- **Management / Admin** (`/management`): admin-only dashboard; user management; API key configuration
- **How-To guide** (`/howto`): 8-section illustrated guide covering every feature; admin-only sections filtered by role
- **Home dashboard** (`/`): stats strip (active deals, total profit, avg margin, watching); hero section; feature cards grid; next events sidebar
- **i18n**: English, Spanish, Catalan translations via `i18next` with `react-i18next`; language switcher in header (EN / ES / CA)
- **Layout**: sticky header with desktop nav; mobile bottom tab bar (9 items); profile dropdown with sign-out; language switcher
- **GitHub Actions CI/CD**: push to `main` triggers frontend build (Vite + secrets injection) and deploy to `gh-pages` branch → GitHub Pages
- **Render deployment**: Flask backend on Render free tier with `gunicorn`; Firebase Admin SDK via Secret File; `FRONTEND_ORIGIN` CORS whitelist; UptimeRobot ping every 5 min to prevent cold starts
- **SPA routing on GitHub Pages**: `public/404.html` redirect script + `index.html` restore script for client-side routing
- **`CLAUDE.md`**: project reference document for AI-assisted development
- **`.claudeignore`**: blocks node_modules, dist, venv, lock files, media, .env, credentials from AI reads
