# @flipops-map search.py — updated 2026-03-15 — Uses named anchors
#
# CONSTANTS:
#   ANCHOR:platform_filters    — PLATFORM_FILTERS dict
#   ANCHOR:platform_display_names — _PLATFORM_DISPLAY_NAMES dict
#   ANCHOR:allowlist           — ALLOWED_DOMAINS + BLOCKED_PATTERNS
#   ANCHOR:listing_patterns    — LISTING_URL_PATTERNS dict + is_listing_url() (regex numeric-ID validator)
#                                milanuncios pattern: r"-\d{6,}\.htm$"
#   ANCHOR:wallapop_reject_patterns — WALLAPOP_REJECT_PATTERNS list + is_relevant_wallapop_item(item)
#   ANCHOR:relevance_filter    — is_relevant_result(url, item=None) — also calls is_relevant_wallapop_item for wallapop URLs
#   ANCHOR:listing_available   — is_listing_available(html_text, next_data) — returns False if sold/reserved/inactive
#   ANCHOR:parse_result_date   — _parse_result_date(date_str) — parses relative/absolute date string → datetime or None
#
# DIRECT API HELPERS (module-level):
#   ANCHOR:fn_build_provider_status — _build_provider_status(uid) — per-provider enabled/used/limit/resets from Firestore
#   ANCHOR:fn_vinted_direct    — search_vinted_direct() — Vinted public REST API (no auth)
#   ANCHOR:fn_ebay_rss         — search_ebay_rss() — eBay RSS feed (first keyword only, URL-encoded)
#   ANCHOR:fn_scrape_item      — scrape_item(url, platform) — 404/410→dead dict; sold/reserved→dead dict via is_listing_available; __NEXT_DATA__ + OG meta fallback
#   ANCHOR:fn_milanuncios_direct — search_milanuncios() imported from services.scrapers.milanuncios; direct HTML scrape; >= 3 results skips Google for milanuncios
#
# ROUTES:
#   ANCHOR:route_geocoder      — GET  /api/geocoder
#   ANCHOR:route_import        — POST /api/import
#   ANCHOR:route_discovery     — POST /api/discovery
#
# ANCHORS (inside discover_listings):
#   ANCHOR:personal_keys_check — uid extraction only (personal key logic moved inside try)
#   ANCHOR:direct_api_always   — Step 2a: Vinted API + eBay RSS + Milanuncios direct scrape; skip_provider_platforms tracks platforms already served
#   ANCHOR:provider_search     — Step 2b: personal keys for wallapop+milanuncios (minus skip_provider_platforms); merges direct+provider
#   ANCHOR:enrich_personal_results — Step 2b+: scrape Wallapop pages with no price (sequential, capped 8 URLs, 0.3s sleep)
#   ANCHOR:fn_ddg_collect      — _ddg_collect closure definition
#   ANCHOR:ddg_call            — DDG search call (impersonate=chrome120)
#   ANCHOR:ddg_fallback        — non-wallapop zero-result fallback query
#   ANCHOR:platform_parallel   — sequential loop over ddg_platforms (no ThreadPoolExecutor)
#   ANCHOR:milanuncios_category_pages — collect milanuncios URLs without numeric ID suffix for separate scraping
#   ANCHOR:url_dedup           — Step 3: normalize URL, strip query, lowercase
#   ANCHOR:scrape_step4        — Step 4: scrape_item per URL (sequential) — calls module-level scrape_item
#   ANCHOR:milanuncios_category_scrape — scrape collected category pages via scrape_milanuncios_page(); adds to listings
#   ANCHOR:direct_api_merge    — Vinted/eBay direct API items merged into listings
#   ANCHOR:location_filter     — Step 5: location filter (drops no coords/city)
#   ANCHOR:platform_counts     — platform_counts assembly
#   ANCHOR:response_return     — final response return
#
# ARCHITECTURE:
#   Platform → data source mapping:
#     wallapop    → search providers only (no native API)
#     milanuncios → search providers only (no native API)
#     vinted      → direct Vinted REST API (search_vinted_direct)
#     ebay_es     → eBay RSS feed (search_ebay_rss)
#
#   Flow inside discover_listings():
#     Step 2a (ANCHOR:direct_api_always):
#       Vinted API + eBay RSS always run first,
#       regardless of personal key status.
#       Removes platform from ddg_platforms on success.
#     Step 2b (ANCHOR:provider_search):
#       personal keys checked for wallapop+milanuncios only.
#       If personal keys exist → merge direct+provider → return.
#     Step 2c: DDG for remaining platforms
#       (wallapop, milanuncios, + any failed direct APIs)
#     Step 3: URL dedup → scrape → location filter → return
#
# GOTCHAS:
#   ⚠️ Direct API results (Vinted/eBay) lack
#      lat/lon — merged BEFORE location filter
#      so they get dropped when location set
#      and city string does not match.
#      TODO: move merge to AFTER location filter
#   ⚠️ Never pass direct API results into
#      scraping loop — already complete dicts
#   ⚠️ item_id empty for OG meta fallback results
#      Use URL as dedup key, not item_id
#   ⚠️ curl_cffi used throughout (not stdlib)
#      Direct API functions use same import
#   ⚠️ Location filter: lat/lon first,
#      falls back to city string matching
#   ⚠️ Milanuncios listing URLs require numeric
#      ID suffix: /anuncios/title-NNNNNN.htm
#      Validated by _MILANUNCIOS_LISTING_RE
#
# DATA FLOW (PATH B order):
#   search_vinted_direct() → items or []
#   search_ebay_rss() → items or []
#   _ddg_collect() → (platform, urls, error)
#   ThreadPoolExecutor → parallel DDG
#   URL dedup → normalized, lowercased,
#               no trailing slash, no params
#   scrape_item() × 8 workers → enriched items
#   direct_results merge ← currently too early
#   location filter → drops no coords/city
#   platform_counts → response

import re
import json
from curl_cffi import requests
from bs4 import BeautifulSoup
from flask import Blueprint, request, jsonify
from services.auth import require_auth
import math
import time
from datetime import datetime, timedelta

# Simple in-memory cache for geocoding results
GEO_CACHE = {}
CACHE_TTL = 3600 # 1 hour

# Hardcoded coordinates for common Spanish cities — bypass unreliable geocoding APIs
CITY_COORDINATES = {
    "barcelona":  (41.3851,  2.1734),
    "madrid":     (40.4168, -3.7038),
    "valencia":   (39.4699, -0.3763),
    "sevilla":    (37.3891, -5.9845),
    "bilbao":     (43.2630, -2.9350),
    "zaragoza":   (41.6488, -0.8891),
    "malaga":     (36.7213, -4.4213),
}

# Haversine formula to calculate distance between two points in km
def calculate_distance(lat1, lon1, lat2, lon2):
    if not all([lat1, lon1, lat2, lon2]):
        return None
    R = 6371 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) * math.sin(dlat / 2) +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) * math.sin(dlon / 2))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

search_bp = Blueprint("search", __name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://es.wallapop.com/"
}

# (site_filter, url_pattern) per platform
# ANCHOR:platform_filters
PLATFORM_FILTERS = {
    "wallapop":    ("site:es.wallapop.com/item",   "wallapop.com/item/"),
    "vinted":      ("site:vinted.es",              "vinted.es"),
    "milanuncios": ("site:milanuncios.com",         "milanuncios.com"),
    "ebay_es":     ("site:ebay.es",                "ebay.es"),
}

# ANCHOR:platform_display_names
_PLATFORM_DISPLAY_NAMES = {
    "vinted": "vinted",
    "milanuncios": "milanuncios",
    "ebay_es": "ebay españa",
}

# ANCHOR:allowlist
ALLOWED_DOMAINS = [
    "es.wallapop.com",
    "www.vinted.es",
    "vinted.es",
    "www.milanuncios.com",
    "milanuncios.com",
    "www.ebay.es",
    "ebay.es",
]

BLOCKED_PATTERNS = [
    "youtube.com", "youtu.be",
    "apple.com", "apps.apple.com",
    "google.com", "google.es",
    "facebook.com", "instagram.com",
    "twitter.com", "x.com",
    "amazon.com", "amazon.es",
    "pccomponentes.com",
    "mediamarkt.es",
    "elcorteingles.es",
    "/b/",              # eBay category browse
    "/catalog/",        # Vinted catalog
    "/brand/",          # Vinted brand page
    "/moviles-telefonos/",  # Wallapop city-browse slugs
    "/bn_",             # eBay browse node
]

# ANCHOR:listing_patterns
LISTING_URL_PATTERNS = {
    "es.wallapop.com": r"/item/",
    "wallapop.com":    r"/item/",
    "vinted.es":       r"/items/\d+",
    "milanuncios.com": r"-\d{6,}\.htm$",
    "ebay.es":         r"/itm/\d+",
    "ebay.com":        r"/itm/\d+",
}


def is_listing_url(url: str) -> bool:
    """Return True only if URL points to an individual listing, not a category or search page."""
    url_lower = url.lower().split("?")[0]
    for domain, pattern in LISTING_URL_PATTERNS.items():
        if domain in url_lower:
            if re.search(pattern, url_lower):
                return True
            print(f"[FILTER] Not a listing URL (no numeric ID): {url[:80]}")
            return False
    return True


WALLAPOP_REJECT_PATTERNS = [
    "firmware", "placa", "tira led",
    "placa main", "despiece", "recambio",
    "repuesto", "cable", "mando solo",
    "piezas", "roto", "averiado",
    "no enciende", "para piezas",
    "spare", "board", "pcb",
]


def is_relevant_wallapop_item(item: dict) -> bool:
    title = item.get("title", "").lower()
    if any(p in title for p in WALLAPOP_REJECT_PATTERNS):
        print(f"[FILTER] Wallapop parts/junk: {title[:60]}")
        return False
    return True


# ANCHOR:relevance_filter
def is_relevant_result(url, item=None):
    """Return True if URL belongs to a known marketplace, is not blocked, and is an individual listing."""
    if not url:
        return False
    url_lower = url.lower()
    if any(blocked in url_lower for blocked in BLOCKED_PATTERNS):
        return False
    if not any(domain in url_lower for domain in ALLOWED_DOMAINS):
        return False
    if "wallapop.com" in url_lower and item is not None:
        if not is_relevant_wallapop_item(item):
            return False
    return is_listing_url(url)


# ANCHOR:listing_available
def is_listing_available(html_text, next_data):
    """Return False if listing is sold, reserved, or inactive."""
    if next_data:
        item_info = next_data.get("props", {}).get("pageProps", {}).get("item")
        if item_info:
            flags = item_info.get("flags", {}) or {}
            if flags.get("sold") or flags.get("reserved"):
                return False
            state = str(item_info.get("state", "") or item_info.get("status", "")).lower()
            if state in {"sold", "reserved", "vendido", "reservado", "inactive"}:
                return False
    if html_text:
        text_lower = html_text.lower()
        for marker in ['"sold":true', '"reserved":true']:
            if marker in text_lower:
                return False
    return True


# ANCHOR:parse_result_date
def _parse_result_date(date_str):
    """Parse relative or absolute date string from search results. Returns datetime or None."""
    if not date_str:
        return None
    d = str(date_str).lower().strip()
    m = re.search(r'(\d+)\s+(hour|day|week|month|year)', d)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        now = datetime.utcnow()
        if unit == 'hour':
            return now - timedelta(hours=n)
        if unit == 'day':
            return now - timedelta(days=n)
        if unit == 'week':
            return now - timedelta(weeks=n)
        if unit == 'month':
            return now - timedelta(days=n * 30)
        if unit == 'year':
            return now - timedelta(days=n * 365)
    for fmt in ["%b %d, %Y", "%Y-%m-%d", "%d/%m/%Y"]:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except (ValueError, TypeError):
            continue
    return None


def _detect_platform(url):
    """Return platform key from URL, or 'unknown' if no match."""
    if not url:
        return "unknown"
    url_lower = url.lower()
    if "wallapop.com" in url_lower:
        return "wallapop"
    if "vinted.es" in url_lower:
        return "vinted"
    if "milanuncios.com" in url_lower:
        return "milanuncios"
    if "ebay.es" in url_lower:
        return "ebay_es"
    return "unknown"


# ANCHOR:fn_build_provider_status
def _build_provider_status(uid: str) -> dict:
    """Build per-provider status dict from Firestore user doc + PROVIDER_LIMITS."""
    try:
        from firebase_admin import firestore
        from services.usage_tracker import PROVIDER_LIMITS
        db = firestore.client()
        user_doc = db.collection("users").document(uid).get()
        if not user_doc.exists:
            return {}
        sp = user_doc.to_dict().get("searchProviders", {})
        status = {}
        for provider in ["scrapingdog", "serpapi", "serper"]:
            limits = PROVIDER_LIMITS.get(provider, {})
            p_data = sp.get(provider, {})
            enabled = p_data.get("enabled") is True and p_data.get("apiKey") is not None
            usage = p_data.get("usage", {})
            status[provider] = {
                "enabled": enabled,
                "used": usage.get("totalRequests", 0),
                "limit": limits.get("free_searches", 0),
                "resets": limits.get("reset_type", "never"),
            }
        return status
    except Exception as e:
        print(f"[RESPONSE] Failed to build provider_status: {e}")
        return {}


# ANCHOR:fn_vinted_direct
def search_vinted_direct(keywords, num=20):
    """Try Vinted public REST API directly (no auth required)."""
    try:
        url = "https://www.vinted.es/api/v2/catalog/items"
        params = {
            "search_text": keywords,
            "per_page": num,
            "page": 1,
            "order": "newest_first",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "es-ES,es;q=0.9",
            "Referer": "https://www.vinted.es/",
            "Origin": "https://www.vinted.es",
        }
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        print(f"[VINTED] Public API response status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            print(f"[VINTED] Items found: {len(items)}")
            return [
                {
                    "title": i.get("title", ""),
                    "url": f"https://www.vinted.es/items/{i['id']}-{i.get('title_slug', i['id'])}",
                    "price": float(i.get("price", {}).get("amount", 0) if isinstance(i.get("price"), dict) else (i.get("price") or 0)),
                    "images": [i["photos"][0]["url"]] if i.get("photos") else [],
                    "platform": "vinted",
                    "item_id": str(i.get("id", "")),
                    "search_provider": "vinted_api",
                    "status": "",
                    "seller": {
                        "name": (i.get("user") or {}).get("login", ""),
                        "id": str((i.get("user") or {}).get("id", "")),
                        "type": "individual",
                        "web_slug": "",
                    },
                    "location": {"city": i.get("city", ""), "lat": None, "lon": None},
                    "condition": i.get("condition", ""),
                }
                for i in items
                if i.get("id")
            ]
        else:
            print(f"[VINTED] Public API unavailable ({resp.status_code}), skipping Vinted")
            return []
    except Exception as e:
        print(f"[VINTED] Direct API error: {e}")
        return []


# ANCHOR:fn_ebay_rss
def search_ebay_rss(keywords, num=20):
    """Try eBay RSS feed before falling back to DDG."""
    try:
        import xml.etree.ElementTree as ET
        import re as re_mod
        import urllib.parse
        # Use only the first keyword to keep the RSS query clean and avoid XML parse errors
        clean_query = keywords.split(',')[0].strip()
        encoded_query = urllib.parse.quote(clean_query)
        rss_url = (
            f"https://www.ebay.es/sch/i.html"
            f"?_nkw={encoded_query}"
            f"&_sacat=0"
            f"&LH_ItemCondition=3000"
            f"&LH_BIN=1"
            f"&_sop=10"
            f"&_ipg={num}"
            f"&_rss=1"
        )
        print(f"[EBAY] RSS URL: {rss_url}")
        rss_headers = {
            "User-Agent": "Mozilla/5.0 (compatible; RSS reader)",
            "Accept": "application/rss+xml, text/xml",
        }
        resp = requests.get(rss_url, headers=rss_headers, timeout=10)
        print(f"[EBAY] RSS response status: {resp.status_code}")
        if resp.status_code != 200:
            return []
        if "Disculpa la interrupción" in resp.text[:200] or "captcha" in resp.text[:200].lower():
            print("[EBAY] eBay returned CAPTCHA — skipping RSS")
            return []
        try:
            root = ET.fromstring(resp.content)
        except ET.ParseError as e:
            print(f"[EBAY] XML parse error: {e}")
            print(f"[EBAY] Response start: {resp.text[:300]}")
            return []
        items = root.findall('.//item')
        print(f"[EBAY] RSS returned {len(items)} items")
        results = []
        for item in items:
            title = item.findtext('title', '')
            link = item.findtext('link', '')
            desc = item.findtext('description', '')
            price_match = re_mod.search(r'[\d,.]+\s*€|EUR\s*[\d,.]+', title + ' ' + desc)
            price_str = price_match.group(0) if price_match else ''
            try:
                price = float(re_mod.sub(r'[^\d.]', '', price_str.replace(',', '.'))) if price_str else 0
            except (ValueError, TypeError):
                price = 0
            if link:
                results.append({
                    "title": title,
                    "url": link,
                    "price": price,
                    "images": [],
                    "platform": "ebay_es",
                    "item_id": link.split('/')[-1].split('?')[0],
                    "search_provider": "ebay_rss",
                    "status": "",
                    "seller": {"name": "", "id": "", "type": "individual", "web_slug": ""},
                    "location": {"city": "", "lat": None, "lon": None},
                    "condition": "",
                })
        return results
    except Exception as e:
        print(f"[EBAY] RSS error: {e}")
        return []


# ANCHOR:fn_scrape_item
def scrape_item(url, platform):
    """Scrape an individual listing page. Returns enriched item dict or None if unavailable/failed."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20, impersonate="chrome120")
        if resp.status_code in (404, 410):
            return {"dead": True, "url": url, "dead_reason": "not_found"}
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        item_data = None

        # Try __NEXT_DATA__ first (reliable for Wallapop)
        script = soup.find("script", id="__NEXT_DATA__")
        if script:
            try:
                next_data = json.loads(script.string)
                if not is_listing_available(resp.text, next_data):
                    return {"dead": True, "url": url, "dead_reason": "sold_reserved"}
                item_info = next_data.get("props", {}).get("pageProps", {}).get("item")
                if item_info:
                    item_state = str(item_info.get("state", "") or item_info.get("status", "")).lower()

                    images = []
                    for img in item_info.get("images", []):
                        img_urls = img.get("urls", {})
                        if isinstance(img_urls, dict):
                            for size in ["big", "xl", "medium"]:
                                if img_urls.get(size):
                                    images.append(img_urls[size])
                                    break

                    raw_title = item_info.get("title", "")
                    title = raw_title.get("original", "") if isinstance(raw_title, dict) else raw_title
                    price_data = item_info.get("price", {})
                    price = price_data.get("cash", {}).get("amount", 0) if isinstance(price_data, dict) else price_data
                    loc_info = item_info.get("location", {}) if isinstance(item_info.get("location"), dict) else {}
                    condition_data = item_info.get("condition", {})
                    condition_label = condition_data.get("label", "") if isinstance(condition_data, dict) else str(condition_data or "")
                    props = next_data.get("props", {}).get("pageProps", {})
                    user_info = item_info.get("user", {})
                    seller_info = props.get("itemSeller") or {}
                    for k, v in user_info.items():
                        if k not in seller_info:
                            seller_info[k] = v

                    item_data = {
                        "item_id": str(item_info.get("id", "")),
                        "title": title,
                        "price": price,
                        "images": images,
                        "url": url,
                        "platform": platform,
                        "status": item_state,
                        "seller": {
                            "name": seller_info.get("microName") or seller_info.get("name") or "",
                            "id": seller_info.get("id", ""),
                            "type": "professional" if (seller_info.get("sellerType") or seller_info.get("extraInfoPro") or seller_info.get("type") == "professional") else seller_info.get("type", "individual"),
                            "web_slug": seller_info.get("webSlug", "") or seller_info.get("web_slug", "")
                        },
                        "location": {
                            "city": loc_info.get("city", ""),
                            "lat": loc_info.get("latitude"),
                            "lon": loc_info.get("longitude"),
                        },
                        "condition": condition_label,
                    }
            except Exception as e:
                print(f"Failed to parse __NEXT_DATA__ from {url}: {e}")

        # OG meta fallback — works for Vinted, Milanuncios, eBay ES
        if not item_data:
            title_el = soup.find("meta", property="og:title")
            title = (title_el.get("content") or "").strip() if title_el else ""
            if not title:
                return None
            price = 0
            price_el = soup.find("meta", property="product:price:amount")
            if price_el:
                try:
                    price = float(price_el.get("content", 0))
                except (ValueError, TypeError):
                    pass
            img_el = soup.find("meta", property="og:image")
            images = [img_el["content"]] if img_el and img_el.get("content") else []
            item_data = {
                "item_id": url.split("/")[-1][:40].split("?")[0],
                "title": title,
                "price": price,
                "images": images,
                "url": url,
                "platform": platform,
                "status": "",
                "seller": {"name": "", "id": "", "type": "individual", "web_slug": ""},
                "location": {"city": "", "lat": None, "lon": None},
                "condition": "",
            }

        if item_data:
            used_next_data = bool(script) and str(item_data.get('item_id', '')).isdigit()
            print(f"[SCRAPE] URL: {url[:80]}")
            print(f"[SCRAPE] Method used: {'NEXT_DATA' if used_next_data else 'OG_META'}")
            print(f"[SCRAPE] Title: {str(item_data.get('title','MISSING'))[:50]}")
            print(f"[SCRAPE] Price: {item_data.get('price','MISSING')}")
            print(f"[SCRAPE] Platform detected: {item_data.get('platform','MISSING')}")
            print(f"[SCRAPE] item_id: {item_data.get('item_id','EMPTY') or 'EMPTY'}")
        else:
            print(f"[SCRAPE] ⚠️ SCRAPE FAILED or incomplete for: {url[:80]}")
        return item_data
    except Exception as e:
        print(f"Failed to scrape {url}: {e}")
        return None


# ANCHOR:route_geocoder
@search_bp.route("/api/geocoder", methods=["GET"])
@require_auth
def geocode():
    query = request.args.get("q", "").strip()
    if not query or len(query) < 3:
        return jsonify([]), 400
        
    # Hardcoded lookup for known Spanish cities
    city_lower = query.lower().strip()
    if city_lower in CITY_COORDINATES:
        lat, lon = CITY_COORDINATES[city_lower]
        print(f"[GEO] Using hardcoded coords for {query}: {lat}, {lon}")
        result = [{"display_name": query, "lat": str(lat), "lon": str(lon), "address": query}]
        GEO_CACHE[query] = (result, time.time() + CACHE_TTL)
        return jsonify(result)

    # Check cache
    now = time.time()
    if query in GEO_CACHE:
        entry, expiry = GEO_CACHE[query]
        if now < expiry:
            return jsonify(entry)

    try:
        # Try Photon (Komoot) - Much more lenient for search-as-you-type
        photon_url = f"https://photon.komoot.io/api/?q={query}&limit=5"
        resp = requests.get(photon_url, timeout=5)
        
        if resp.status_code == 200:
            data = resp.json()
            results = []
            for feat in data.get("features", []):
                p = feat.get("properties", {})
                c = feat.get("geometry", {}).get("coordinates", [0, 0])
                # Construct display name similar to Nominatim
                parts = [p.get("name"), p.get("street"), p.get("district"), p.get("city"), p.get("country")]
                display_name = ", ".join([v for v in parts if v])
                results.append({
                    "display_name": display_name,
                    "lat": str(c[1]),
                    "lon": str(c[0]),
                    "address": display_name
                })
            
            if results:
                GEO_CACHE[query] = (results, now + CACHE_TTL)
                return jsonify(results)
    except Exception as e:
        print(f"DEBUG: Photon error: {str(e)}")

    try:
        # Fallback to Nominatim
        url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=5&addressdetails=1"
        resp = requests.get(url, headers={
            "User-Agent": "FlipOps-App-Production/1.1 (contact: admin@flipops.com)",
            "Accept-Language": "en"
        }, timeout=5)
        
        if resp.status_code == 200:
            results = resp.json()
            GEO_CACHE[query] = (results, now + CACHE_TTL)
            return jsonify(results)
        
        # If still 429, return empty instead of error to keep UI interactive
        return jsonify([])
    except Exception as e:
        print(f"DEBUG: Geocoding fallback error: {str(e)}")
        return jsonify([]), 500

# ANCHOR:route_import
@search_bp.route("/api/import", methods=["POST"])
@require_auth
def import_url():
    data = request.json or {}
    url = data.get("url", "").strip()
    
    if not url or not url.startswith("http"):
        return jsonify({"error": "Valid URL is required"}), 400

    try:
        # Use curl_cffi to bypass Wallapop/Cloudflare protections locally (Free & Forever)
        print(f"DEBUG: Scrapping {url} with curl_cffi...")
        resp = requests.get(url, headers=HEADERS, timeout=30, impersonate="chrome120")
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Try parsing __NEXT_DATA__ JSON
        item_data = {}
        script = soup.find("script", id="__NEXT_DATA__")
        if script:
            try:
                next_data = json.loads(script.string)
                # Wallapop typically stores listing data deep in pageProps
                props = next_data.get("props", {}).get("pageProps", {})
                item_info = props.get("item")
                if item_info:
                    # Extract images more robustly
                    images = []
                    for img in item_info.get("images", []):
                        urls = img.get("urls", {})
                        if isinstance(urls, dict):
                            # Prioritize high quality sizes
                            for size in ["big", "xl", "original", "medium", "large"]:
                                if urls.get(size):
                                    images.append(urls[size])
                                    break
                    
                    # Handle title and description objects (which can have translated/original fields)
                    raw_title = item_info.get("title", "")
                    title = raw_title.get("original", "") if isinstance(raw_title, dict) else raw_title
                    
                    raw_desc = item_info.get("description", "")
                    description = raw_desc.get("original", "") if isinstance(raw_desc, dict) else raw_desc

                    user_info = item_info.get("user", {})
                    seller_info = props.get("itemSeller") or {}
                    # Merge them (itemSeller has more details like webSlug and stats)
                    for k, v in user_info.items():
                        if k not in seller_info:
                            seller_info[k] = v

                    loc_info = item_info.get("location", {})
                    
                    # Condition: try condition.label first, then extraInfo, will also be overridden by HTML extraction below
                    cond_data = item_info.get("condition", {})
                    if isinstance(cond_data, dict):
                        raw_condition = cond_data.get("label") or cond_data.get("condition") or ""
                    elif isinstance(cond_data, str):
                        raw_condition = cond_data
                    else:
                        raw_condition = ""
                    
                    # Also check extraInfo list (Wallapop sometimes puts condition there)
                    for extra in item_info.get("extraInfo", []) or []:
                        if extra.get("type") in ["condition", "Condición", "Condicion"] and extra.get("label"):
                            raw_condition = extra["label"]
                            break

                    # Seller name: try multiple fields
                    seller_name = (
                        seller_info.get("microName")
                        or seller_info.get("name")
                        or seller_info.get("micro_name")
                        or seller_info.get("display_name")
                        or ""
                    )
                    
                    item_data = {
                        "title": title,
                        "price": item_info.get("price", {}).get("cash", {}).get("amount", 0) if isinstance(item_info.get("price"), dict) else item_info.get("sale_price", 0),
                        "description": description,
                        "images": [i for i in images if i],
                        "seller": {
                            "name": seller_name,
                            "id": seller_info.get("id", ""),
                            "type": "professional" if (seller_info.get("sellerType") or seller_info.get("extraInfoPro") or seller_info.get("type") == "professional") else seller_info.get("type", "individual"),
                            "rating": seller_info.get("stats", {}).get("ratings", {}).get("reviews", 0),
                            "scoring": seller_info.get("stats", {}).get("ratings", {}).get("scoring", 0),
                            "web_slug": seller_info.get("webSlug", "") or seller_info.get("web_slug", "")
                        },
                        "location": {
                            "city": loc_info.get("city", ""),
                            "lat": loc_info.get("latitude"),
                            "lon": loc_info.get("longitude"),
                            "postal_code": loc_info.get("postalCode")
                        },
                        "url": url,
                        "item_id": str(item_info.get("id", "")),
                        "published_date": item_info.get("publishedDate") or item_info.get("creationDate") or item_info.get("publishDate"),
                        "modified_date": item_info.get("modifiedDate"),
                        "shipping_allowed": item_info.get("shipping", {}).get("isShippingAllowedByUser", False),
                        "condition": raw_condition  # Will be overridden below if we extract from HTML
                    }
                    if not item_data["price"]:
                        item_data["price"] = item_info.get("price", 0)
            except Exception as e:
                print(f"Failed to parse NEXT DATA: {e}")
                
        # Extract characteristics text from the page HTML (e.g. "Como nuevo · Apple · iPhone 16 · 256 GB · Azul")
        if item_data:
            chars_el = soup.find(class_=lambda c: c and "ItemDetailCharacteristics" in c and "container" in c)
            if chars_el:
                chars_text = chars_el.get_text(" · ", strip=True)
                item_data["characteristics"] = chars_text
                # The first token is usually the condition, override if we don't have a good one
                if not item_data.get("condition") or item_data["condition"] == "Desconocido":
                    first_token = chars_text.split("·")[0].strip() if chars_text else ""
                    if first_token:
                        item_data["condition"] = first_token

        # Extract seller info from HTML - Wallapop renders these as regular spans (SSR)
        # Class patterns: ItemDetailSellerProfile__name, __rating__score, __rating__reviews
        if item_data and isinstance(item_data.get("seller"), dict):
            seller = item_data["seller"]

            # Seller name
            if not seller.get("name"):
                name_el = soup.find(class_=lambda c: c and "ItemDetailSellerProfile__name" in c)
                if name_el:
                    seller["name"] = name_el.get_text(strip=True)

            # Web slug / ID from the actual link wrapper
            if not seller.get("web_slug"):
                # The seller profile is usually wrapped in an 'a' tag wrapping the avatar or the whole block
                profile_link = soup.find("a", href=lambda h: h and "/user/" in h.lower())
                if profile_link:
                    url_parts = profile_link["href"].rstrip("/").split("/")
                    seller["web_slug"] = url_parts[-1]


            # Rating score (e.g. "4.9")
            score_el = soup.find(class_=lambda c: c and "ItemDetailSellerProfile__rating__score" in c)
            if score_el:
                try:
                    seller["scoring"] = float(score_el.get_text(strip=True)) * 20  # convert 4.9/5 → 98/100
                    seller["score_raw"] = float(score_el.get_text(strip=True))
                except (ValueError, TypeError):
                    pass

            # Review count (e.g. "(26)")
            reviews_el = soup.find(class_=lambda c: c and "ItemDetailSellerProfile__rating__reviews" in c)
            if reviews_el:
                # The element contains nested spans — try to find the underlined number span first
                underline_el = reviews_el.find(class_=lambda c: c and "underline" in c.lower())
                reviews_text = (underline_el or reviews_el).get_text(strip=True).strip("()")
                try:
                    seller["rating"] = int(reviews_text)
                except (ValueError, TypeError):
                    pass

            # Seller type text (e.g. "Profesional" or empty for private seller)
            type_el = soup.find(class_=lambda c: c and "ItemDetailSellerProfile__type" in c)
            if type_el:
                type_text = type_el.get_text(strip=True).lower()
                if "pro" in type_text or "profes" in type_text or "empresa" in type_text or "shop" in type_text:
                    seller["type"] = "professional"
                elif type_text:
                    seller["type"] = "individual"

        # Fallback to OG meta tags if JSON parsing fails or misses data
        title_meta = soup.find("meta", property="og:title")
        title = title_meta["content"] if title_meta else ""
        
        desc_meta = soup.find("meta", property="og:description")
        desc = desc_meta["content"] if desc_meta else ""
        
        price = 0
        price_meta = soup.find("meta", property="product:price:amount")
        if price_meta:
            try:
                price = float(price_meta["content"])
            except:
                pass
        
        image_meta = soup.find("meta", property="og:image")
        images = [image_meta["content"]] if image_meta else []

        # If NEXT_DATA failed completely
        if not item_data or not item_data.get("title"):
            item_data = {
                "title": title,
                "price": price,
                "description": desc,
                "images": images,
                "seller": "Unknown",
                "location": "Unknown",
                "url": url,
                "item_id": ""
            }
        # If NEXT_DATA worked but missed images
        elif not item_data.get("images") and images:
            item_data["images"] = images

        return jsonify(item_data)
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code in [403, 401]:
            return jsonify({"error": "Access denied by Wallapop protection (403 Forbidden)"}), 403
        return jsonify({"error": f"Failed to fetch listing: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500

# ANCHOR:route_discovery
@search_bp.route("/api/discovery", methods=["POST"])
@require_auth
def discover_listings():
    import re
    import gc
    import time
    from urllib.parse import unquote, urlparse, urlunparse
    gc.collect()

    req_data = request.json or {}
    keywords = req_data.get("keywords", "").strip()
    location = req_data.get("location", "").strip()
    page = req_data.get("page", 1)
    platforms = req_data.get("platforms", ["wallapop"])
    offset = (page - 1) * 30
    deadline = time.time() + 25  # Global 25s timeout — return partial results if exceeded

    if not keywords:
        return jsonify({"error": "Keywords are required"}), 400

    # Validate platforms against known list
    valid_platforms = set(PLATFORM_FILTERS.keys())
    platforms = [p for p in platforms if p in valid_platforms] or ["wallapop"]

    platform_errors = []
    print(f"[DISCOVERY] Request received. Keywords: {keywords!r}, Platforms: {platforms}, Page: {page}")

    # ANCHOR:personal_keys_check
    # uid extracted here; personal key check runs inside try after direct APIs
    uid = request.user['uid']

    try:
        # Step 1: Geocode location
        loc_lat, loc_lon = None, None
        if location:
            city_lower = location.lower().strip()
            if city_lower in CITY_COORDINATES:
                loc_lat, loc_lon = CITY_COORDINATES[city_lower]
                print(f"[GEO] Using hardcoded coords for {location}: {loc_lat}, {loc_lon}")
            else:
                try:
                    geo_resp = requests.get(
                        f"https://photon.komoot.io/api/?q={location}&limit=1",
                        timeout=5
                    )
                    if geo_resp.status_code == 200:
                        feats = geo_resp.json().get("features", [])
                        if feats:
                            coords = feats[0].get("geometry", {}).get("coordinates", [])
                            if len(coords) >= 2:
                                loc_lon, loc_lat = float(coords[0]), float(coords[1])
                                print(f"DEBUG: Geocoded '{location}' → lat={loc_lat}, lon={loc_lon}")
                except Exception as e:
                    print(f"DEBUG: Location geocoding failed: {e}")

        # ANCHOR:direct_api_always
        # Step 2a: Always run native APIs first (Vinted + eBay + Milanuncios direct), regardless of personal key status
        direct_results = []
        ddg_platforms = list(platforms)
        skip_provider_platforms = set()  # platforms already served by a native scraper (skip Google providers)

        if "vinted" in platforms:
            vinted_items = search_vinted_direct(keywords)
            if vinted_items:
                direct_results.extend(vinted_items)
                if "vinted" in ddg_platforms:
                    ddg_platforms.remove("vinted")
                print(f"[VINTED] {len(vinted_items)} direct API results")
            else:
                print("[VINTED] Direct API failed, DDG fallback for admin path")

        if "ebay_es" in platforms:
            ebay_items = search_ebay_rss(keywords)
            if ebay_items:
                direct_results.extend(ebay_items)
                if "ebay_es" in ddg_platforms:
                    ddg_platforms.remove("ebay_es")
                print(f"[EBAY] {len(ebay_items)} RSS results")
            else:
                print("[EBAY] RSS failed, DDG fallback for admin path")

        if "milanuncios" in platforms:
            from services.scrapers.milanuncios import search_milanuncios
            milanuncios_items = search_milanuncios(keywords)
            if len(milanuncios_items) >= 3:
                direct_results.extend(milanuncios_items)
                if "milanuncios" in ddg_platforms:
                    ddg_platforms.remove("milanuncios")
                skip_provider_platforms.add("milanuncios")
            else:
                print(f"[MILANUNCIOS] Falling back to Google")

        # ANCHOR:provider_search
        # Step 2b: Check personal keys for wallapop + milanuncios only
        from services.search_provider import search_with_personal_keys, SEARCH_PROVIDER_PLATFORMS
        provider_platforms = [p for p in platforms if p in SEARCH_PROVIDER_PLATFORMS and p not in skip_provider_platforms]
        print(f"[DISCOVERY] Checking personal keys for uid: {uid[:8]}...")
        print(f"[SEARCH] Provider platforms: {provider_platforms}")
        print(f"[SEARCH] Location passed: {location!r}")
        personal = None
        if provider_platforms:
            personal = search_with_personal_keys(
                query=keywords,
                num_results=req_data.get("num_results", 20),
                uid=uid,
                platforms=provider_platforms,
                location=location or None,
            )
        if personal:
            print(f"[DISCOVERY] Using personal providers: {personal.get('active_providers', [])}")
            raw_results = direct_results + personal["results"]
            # Apply same URL relevance + listing-URL filter as DDG path
            all_results = [r for r in raw_results if is_relevant_result(r.get("url", ""), r)]
            print(f"[PERSONAL KEYS] URL filter: {len(raw_results)} → {len(all_results)} (dropped {len(raw_results) - len(all_results)})")

            # ANCHOR:enrich_personal_results
            # Freshness filter: skip Wallapop results older than 14 days
            _fresh = []
            _stale = 0
            for _r in all_results:
                if _r.get("platform") == "wallapop":
                    _dt = _parse_result_date(_r.get("date", ""))
                    if _dt is not None and (datetime.utcnow() - _dt).days > 14:
                        _stale += 1
                        print(f"[ENRICH] Skipping stale ({_dt.date()}): {_r.get('url', '')[:60]}")
                        continue
                _fresh.append(_r)
            if _stale:
                print(f"[ENRICH] Filtered {_stale} stale Wallapop results (>14 days)")
            all_results = _fresh

            items_to_enrich = [
                r for r in all_results
                if not r.get("price")
                and r.get("url", "").startswith("https://es.wallapop.com/item/")
                and not r.get("url", "").endswith("...")
                and len(r.get("url", "")) >= 30
            ]
            dead_urls = set()
            if items_to_enrich:
                if time.time() > deadline:
                    print(f"[DISCOVERY] Timeout reached before enrich — skipping enrichment")
                    items_to_enrich = []
                else:
                    print(f"[ENRICH] Scraping {len(items_to_enrich)} Wallapop pages for price data")
            if items_to_enrich:
                items_to_enrich = items_to_enrich[:6]
                print(f"[ENRICH] Enriching {len(items_to_enrich)} URLs (capped at 6)")
                enriched = 0
                dead_not_found = 0
                dead_sold = 0
                no_price_count = 0
                for item in items_to_enrich:
                    try:
                        scraped = scrape_item(item["url"], "wallapop")
                        if scraped and scraped.get("dead"):
                            dead_urls.add(item.get("url", ""))
                            if scraped.get("dead_reason") == "not_found":
                                dead_not_found += 1
                                print(f"[ENRICH] 🚫 Not found (404): {item['url'][:60]}")
                            else:
                                dead_sold += 1
                                print(f"[ENRICH] 🚫 Sold/reserved: {item['url'][:60]}")
                        elif scraped and scraped.get("price"):
                            item["price"] = scraped["price"]
                            item["title"] = scraped.get("title") or item["title"]
                            item["images"] = scraped.get("images", [])
                            item["item_id"] = scraped.get("item_id", "")
                            item["description"] = scraped.get("description", "")
                            item["condition"] = scraped.get("condition", "")
                            enriched += 1
                            print(f"[ENRICH] ✅ {str(item['title'])[:40]} → €{item['price']}")
                        else:
                            no_price_count += 1
                            print(f"[ENRICH] ⚠️ No price for: {item['url'][:60]}")
                    except Exception as e:
                        print(f"[ENRICH] ❌ Failed: {item['url'][:60]} — {e}")
                    time.sleep(0.3)
                if dead_urls:
                    all_results = [r for r in all_results if r.get("url", "") not in dead_urls]
                print(f"[ENRICH] Summary: {enriched} live, {dead_not_found + dead_sold} dead ({dead_sold} sold/reserved, {dead_not_found} not found), {no_price_count} no-price")

            with_price = sum(1 for r in all_results if r.get("price"))
            without_price = len(all_results) - with_price
            print(f"[RESPONSE] Items with price: {with_price} | without: {without_price}")

            platform_counts = {}
            for item in all_results:
                p_name = item.get("platform", "wallapop")
                platform_counts[p_name] = platform_counts.get(p_name, 0) + 1
            provider_status = _build_provider_status(uid)
            print(f"[RESPONSE] Provider status: {provider_status}")
            return jsonify({
                "results": all_results,
                "source": "personal",
                "active_providers": personal["active_providers"],
                "platform_errors": [],
                "platform_counts": platform_counts,
                "provider_status": provider_status,
            })
        print(f"[DISCOVERY] No personal keys — using DDG (admin provider)")

        # Step 2c: Collect URLs per platform via DDG (wallapop, milanuncios, + any failed direct API platforms)
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

        # ANCHOR:fn_ddg_collect
        def _ddg_collect(platform):
            """Run DDG searches for one platform. Returns (platform, urls, error_or_None)."""
            site_filter, url_pattern = PLATFORM_FILTERS[platform]
            # Wallapop gets the original proven query set; others get a simpler set
            if platform == "wallapop":
                if location:
                    queries = [
                        f"site:es.wallapop.com/item/ {keywords} {location}",
                        f"{keywords} wallapop {location}",
                        f"site:es.wallapop.com/item/ {keywords}",
                        f"{keywords} wallapop segunda mano {location}",
                        f"{keywords} wallapop segunda mano",
                    ]
                else:
                    queries = [
                        f"site:es.wallapop.com/item/ {keywords}",
                        f"{keywords} wallapop",
                        f"{keywords} wallapop segunda mano",
                        f'"{keywords}" wallapop',
                    ]
            else:
                queries = [f"{site_filter} {keywords}"]
                if location:
                    queries.insert(0, f"{site_filter} {keywords} {location}")
                queries.append(f"{keywords} {platform} segunda mano")

            print(f"[DISCOVERY] [{platform}] Will run {len(queries)} queries: {queries}")
            urls = []
            try:
                for query in queries:
                    params = {"q": query}
                    if offset > 0:
                        params["s"] = offset
                    print(f"DEBUG [{platform}] DDG: {query}")
                    # ANCHOR:ddg_call
                    try:
                        resp = requests.get(
                            "https://html.duckduckgo.com/html/",
                            params=params,
                            headers={"User-Agent": ua},
                            timeout=8,
                            impersonate="chrome120"
                        )
                        if resp.status_code == 200 and "bots use DuckDuckGo too" not in resp.text:
                            soup = BeautifulSoup(resp.text, "html.parser")
                            found_in_query = 0
                            for a in soup.find_all("a", href=True):
                                href = a["href"]
                                actual_url = None
                                if "uddg=" in href:
                                    try:
                                        actual_url = unquote(href.split("uddg=")[1].split("&")[0])
                                    except:
                                        continue
                                elif url_pattern in href:
                                    actual_url = href if href.startswith("http") else f"https:{href}"
                                if actual_url and url_pattern in actual_url and actual_url not in urls:
                                    urls.append(actual_url)
                                    found_in_query += 1
                            # Regex fallback
                            if found_in_query == 0:
                                for m in re.findall(r'https?%3A%2F%2F[^&"\' >%]+', resp.text):
                                    u = unquote(m)
                                    if url_pattern in u and u not in urls:
                                        urls.append(u)
                                        found_in_query += 1
                            print(f"DEBUG [{platform}] query yielded {found_in_query} URLs (total: {len(urls)})")
                        elif "bots use DuckDuckGo too" in resp.text:
                            print(f"DEBUG [{platform}] DDG rate limited, retrying once…")
                            time.sleep(2)
                            resp2 = requests.get(
                                "https://html.duckduckgo.com/html/",
                                params=params,
                                headers={"User-Agent": ua},
                                timeout=8,
                                impersonate="chrome120"
                            )
                            if resp2.status_code == 200 and "bots use DuckDuckGo too" not in resp2.text:
                                soup2 = BeautifulSoup(resp2.text, "html.parser")
                                for a in soup2.find_all("a", href=True):
                                    href = a["href"]
                                    actual_url = None
                                    if "uddg=" in href:
                                        try:
                                            actual_url = unquote(href.split("uddg=")[1].split("&")[0])
                                        except:
                                            continue
                                    elif url_pattern in href:
                                        actual_url = href if href.startswith("http") else f"https:{href}"
                                    if actual_url and url_pattern in actual_url and actual_url not in urls:
                                        urls.append(actual_url)
                    except Exception as e:
                        print(f"DEBUG [{platform}] query error: {e}")

                # Wallapop-only direct search fallback
                if platform == "wallapop" and len(urls) < 5:
                    try:
                        wall_url = f"https://es.wallapop.com/search?keywords={keywords}"
                        if location:
                            wall_url += f"&location={location}"
                        resp = requests.get(wall_url, headers=HEADERS, timeout=20, impersonate="chrome120")
                        if resp.status_code == 200:
                            soup = BeautifulSoup(resp.text, "html.parser")
                            script = soup.find("script", id="__NEXT_DATA__")
                            if script:
                                ndata = json.loads(script.string)
                                for slug, item_id in re.findall(r'"webSlug":"([^"]+)","id":"(\d+)"', json.dumps(ndata)):
                                    u = f"https://es.wallapop.com/item/{slug}-{item_id}"
                                    if u not in urls:
                                        urls.append(u)
                            if not urls:
                                for a in soup.find_all("a", href=True):
                                    if "/item/" in a["href"] and "es.wallapop.com" in a["href"]:
                                        if a["href"] not in urls:
                                            urls.append(a["href"])
                    except Exception as e:
                        print(f"DEBUG: Wallapop direct fallback failed: {e}")

                # ANCHOR:ddg_fallback
                # Non-wallapop fallback: if site: queries returned nothing, try plain keyword search
                if len(urls) == 0 and platform != "wallapop":
                    pname = _PLATFORM_DISPLAY_NAMES.get(platform, platform)
                    fallback_q = f"{keywords} {pname} segunda mano"
                    print(f"[DISCOVERY] [{platform}] 0 results from site: queries, trying fallback: {fallback_q!r}")
                    try:
                        resp = requests.get(
                            "https://html.duckduckgo.com/html/",
                            params={"q": fallback_q},
                            headers={"User-Agent": ua},
                            timeout=8,
                            impersonate="chrome120"
                        )
                        if resp.status_code == 200 and "bots use DuckDuckGo too" not in resp.text:
                            soup = BeautifulSoup(resp.text, "html.parser")
                            for a in soup.find_all("a", href=True):
                                href = a["href"]
                                actual_url = None
                                if "uddg=" in href:
                                    try:
                                        actual_url = unquote(href.split("uddg=")[1].split("&")[0])
                                    except:
                                        continue
                                elif url_pattern in href:
                                    actual_url = href if href.startswith("http") else f"https:{href}"
                                if actual_url and url_pattern in actual_url and actual_url not in urls:
                                    urls.append(actual_url)
                        print(f"[DISCOVERY] [{platform}] fallback returned {len(urls)} URLs")
                    except Exception as e:
                        print(f"[DISCOVERY] [{platform}] fallback failed: {e}")

                return platform, urls[:30], None
            except Exception as e:
                return platform, [], str(e)

        # ANCHOR:platform_parallel
        # Run platform searches sequentially
        tagged_urls = []  # list of (url, platform)
        for p in ddg_platforms:
            plat, urls, err = _ddg_collect(p)
            if err:
                platform_errors.append(f"{plat}: {err}")
                print(f"DEBUG: Platform {plat} failed: {err}")
            else:
                for url in urls:
                    tagged_urls.append((url, plat))
                print(f"DEBUG: Platform {plat}: {len(urls)} URLs")
                print(f"[DDG] Platform: {plat}")
                print(f"[DDG] Raw URLs collected ({len(urls)}):")
                for u in urls:
                    print(f"  [DDG URL] {u}")

        # ANCHOR:milanuncios_category_pages
        # Separate Milanuncios category pages (no numeric listing ID) from listing URLs
        _milan_category_pages = []
        _filtered_tagged = []
        for _url, _plat in tagged_urls:
            if _plat == "milanuncios" and not re.search(r'-\d{5,}\.htm', _url.lower()):
                _milan_category_pages.append(_url)
                print(f"[MILANUNCIOS] Category page collected: {_url[:80]}")
            else:
                _filtered_tagged.append((_url, _plat))
        if _milan_category_pages:
            print(f"[MILANUNCIOS] {len(_milan_category_pages)} category pages, {len(_filtered_tagged)} listing URLs kept")
            tagged_urls = _filtered_tagged

        # ANCHOR:url_dedup
        # Step 3: Deduplicate by normalized URL (lowercase, strip trailing slash + query params)
        def _norm(u):
            p = urlparse(u.lower().rstrip("/"))
            return urlunparse(p._replace(query="", fragment=""))

        seen = set()
        deduped = []
        for url, plat in tagged_urls:
            n = _norm(url)
            if n not in seen:
                seen.add(n)
                deduped.append((url, plat))
        deduped = deduped[:60]
        print(f"DEBUG: {len(deduped)} unique URLs across platforms: {platforms}")
        print(f"[DEDUP] URLs after dedup ({len(deduped)}):")
        for u, _p in deduped:
            print(f"  [DEDUP URL] {u}")

        if not deduped:
            return jsonify({"results": [], "platform_errors": platform_errors, "platform_counts": {}})

        # ANCHOR:scrape_step4
        # Step 4: Scrape each URL sequentially
        if time.time() > deadline:
            print(f"[DISCOVERY] Timeout reached before scrape — returning partial results: {len(direct_results)} items")
            return jsonify({"results": direct_results, "platform_errors": platform_errors, "platform_counts": {}, "timed_out": True})
        listings = []
        for url, plat in deduped:
            try:
                result = scrape_item(url, plat)
                if result:
                    listings.append(result)
            except Exception as e:
                print(f"[SCRAPE] Failed {url[:60]}: {e}")

        # ANCHOR:milanuncios_category_scrape
        # Scrape Milanuncios category pages collected during DDG — extract individual listings
        if _milan_category_pages and time.time() <= deadline:
            from services.scrapers.milanuncios import scrape_milanuncios_page
            _cat_session = requests.Session()
            _cat_scraped = 0
            for _cat_url in _milan_category_pages[:3]:
                try:
                    _cat_items = scrape_milanuncios_page(_cat_url, _cat_session)
                    listings.extend(_cat_items)
                    _cat_scraped += len(_cat_items)
                except Exception as _e:
                    print(f"[MILANUNCIOS] Category scrape error: {_cat_url[:60]} — {_e}")
                time.sleep(0.5)
            print(f"[MILANUNCIOS] Scraped {_cat_scraped} listings from {min(len(_milan_category_pages), 3)} category pages")

        # ANCHOR:direct_api_merge
        # Merge direct API results (Vinted, eBay RSS) — bypass scraping
        if direct_results:
            print(f"[DISCOVERY] Merging {len(direct_results)} direct API results into {len(listings)} scraped results")
            vinted_direct = [r for r in direct_results if r.get("platform") == "vinted"]
            ebay_direct = [r for r in direct_results if r.get("platform") == "ebay_es"]
            print(f"[DIRECT] Vinted results ({len(vinted_direct)}):")
            for r in vinted_direct:
                print(f"  [VINTED URL] {r.get('url')} | title: {str(r.get('title',''))[:40]}")
            print(f"[DIRECT] eBay results ({len(ebay_direct)}):")
            for r in ebay_direct:
                print(f"  [EBAY URL] {r.get('url')} | title: {str(r.get('title',''))[:40]}")
            listings.extend(direct_results)

        # ANCHOR:location_filter
        # Step 5: Location filtering
        if location:
            if loc_lat and loc_lon:
                RADIUS_KM = 60
                filtered = []
                for item in listings:
                    item_lat = item.get("location", {}).get("lat")
                    item_lon = item.get("location", {}).get("lon")
                    if item_lat and item_lon:
                        dist = calculate_distance(loc_lat, loc_lon, float(item_lat), float(item_lon))
                        if dist is not None and dist <= RADIUS_KM:
                            item["distance_km"] = round(dist, 1)
                            filtered.append(item)
                    else:
                        item_city = item.get("location", {}).get("city", "").lower()
                        loc_lower = location.lower()
                        if loc_lower in item_city or item_city in loc_lower:
                            filtered.append(item)
                listings = filtered
            else:
                loc_lower = location.lower()
                listings = [
                    item for item in listings
                    if loc_lower in item.get("location", {}).get("city", "").lower()
                    or item.get("location", {}).get("city", "").lower() in loc_lower
                ]

        # ANCHOR:relevance_filter
        # Filter out results from unknown/blocked domains and fix missing platform field
        before_filter = len(listings)
        relevant = []
        for item in listings:
            url = item.get("url", "")
            if not is_relevant_result(url, item):
                print(f"[FILTER] ❌ DROP | platform={item.get('platform')} | url={url[:80]}")
                continue
            if not item.get("platform") or item.get("platform") == "unknown":
                item["platform"] = _detect_platform(url)
            if item.get("platform") == "unknown":
                print(f"[FILTER] ❌ DROP | platform=unknown | url={url[:80]}")
                continue
            print(f"[FILTER] ✅ KEPT | platform={item.get('platform')} | url={url[:80]}")
            relevant.append(item)
        listings = relevant
        print(f"[DISCOVERY] Relevance filter: {before_filter} → {len(listings)} (dropped {before_filter - len(listings)})")

        # ANCHOR:platform_counts
        # Count results per platform
        platform_counts = {}
        for item in listings:
            p = item.get("platform", "wallapop")
            platform_counts[p] = platform_counts.get(p, 0) + 1

        print(f"DEBUG: Discovery returning {len(listings)} listings. Counts: {platform_counts}")
        # ANCHOR:response_return
        print(f"[RESPONSE] Sending {len(listings)} results")
        for r in listings:
            print(f"  [RESULT] platform={r.get('platform')} | title={str(r.get('title',''))[:40]} | url={str(r.get('url',''))[:60]}")
        provider_status = _build_provider_status(uid)
        print(f"[RESPONSE] Provider status: {provider_status}")
        return jsonify({"results": listings, "platform_errors": platform_errors, "platform_counts": platform_counts, "source": "admin", "active_providers": ["duckduckgo"], "provider_status": provider_status})

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"DEBUG: Discovery failed: {error_trace}")
        return jsonify({"error": f"Discovery failed: {str(e)}", "traceback": error_trace}), 500
