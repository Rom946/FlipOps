# @flipops-map search_provider.py — updated 2026-03-15 — Uses named anchors
#
# IMPORTS: ANCHOR:imports
# CONSTANTS:
#   ANCHOR:provider_limits              — per-provider credit limits, reset type, searches/credit
#   ANCHOR:search_provider_platforms    — SEARCH_PROVIDER_PLATFORMS list (wallapop + milanuncios only)
#   ANCHOR:platform_domains             — PLATFORM_DOMAINS dict + build_scoped_query() fallback helper
#   ANCHOR:platform_query_templates     — PLATFORM_QUERY_TEMPLATES + build_platform_query() per-platform query builder
# FUNCTIONS:
#   ANCHOR:detect_platform              — _detect_platform(url) — detect platform from URL string
#   ANCHOR:search_scrapingdog           — search_scrapingdog(query, num, api_key, platforms, location)
#   ANCHOR:search_serpapi               — search_serpapi(query, num, api_key, platforms, location) — includes `date` field
#   ANCHOR:search_serper                — search_serper(query, num, api_key, platforms, location) — includes `date` field
#   ANCHOR:keyword_split                — split_keywords(keywords) — splits comma-sep variants, max 5, for per-variant search
#   ANCHOR:search_with_personal_keys    — per-platform per-variant search (query, num, uid, platforms, location)
#           Firestore lookup → decrypt keys → split_keywords (capped at 3 variants) →
#           Phase 1: serper+serpapi sequential (0.5s sleep between calls)
#           → Phase 2: scrapingdog sequential (1.5s delay, only where phase1 got <3 results per platform/variant)
#           → dedup + cap MAX_PER_PLATFORM=10; skips vinted/ebay_es (use native APIs)
# ANCHORS:
#   ANCHOR:personal_keys_entry_log      — active providers + platforms + location log
#   ANCHOR:personal_keys_platform_skip  — skip log for vinted/ebay_es (use native APIs instead)
#   ANCHOR:personal_keys_per_platform   — Phase1 (serper+serpapi parallel) + Phase2 (scrapingdog sequential w/ priority_counts gate)
#   ANCHOR:personal_keys_usage_thread   — increment_usage background thread (once per provider, inside _collect_results helper)
#   ANCHOR:personal_keys_dedup          — deduplication by normalized URL
#   ANCHOR:personal_keys_dedup_log      — merged results log (before return)
#   ANCHOR:new_provider_insertion       — where to add new provider function (between search_serper and search_with_personal_keys)

# ANCHOR:imports
import os
import time
import threading
import requests
from firebase_admin import firestore
from services.encryption import decrypt_key
from services.usage_tracker import increment_usage

# ANCHOR:provider_limits
PROVIDER_LIMITS = {
    "scrapingdog": {
        "free_credits": 1000,
        "credits_per_search": 5,
        "free_searches": 200,
        "reset_type": "never",
        "reset_day": None,
    },
    "serpapi": {
        "free_credits": 250,
        "credits_per_search": 1,
        "free_searches": 250,
        "reset_type": "monthly",
        "reset_day": None,
    },
    "serper": {
        "free_credits": 2500,
        "credits_per_search": 1,
        "free_searches": 2500,
        "reset_type": "monthly",
        "reset_day": 1,
    },
    "duckduckgo": {
        "free_credits": None,
        "credits_per_search": 0,
        "free_searches": None,
        "reset_type": "never",
        "reset_day": None,
    },
}


# ANCHOR:detect_platform
def _detect_platform(url: str) -> str:
    url = url.lower()
    if "wallapop.com" in url:
        return "wallapop"
    if "vinted.es" in url:
        return "vinted"
    if "milanuncios.com" in url:
        return "milanuncios"
    if "ebay.es" in url:
        return "ebay_es"
    return "unknown"


# ANCHOR:search_provider_platforms
# Platforms served by search providers (Google-based).
# vinted and ebay_es use native APIs and are excluded from search provider queries.
SEARCH_PROVIDER_PLATFORMS = ["wallapop", "milanuncios"]

# Max concurrent provider requests — keeps RAM within Render free tier (512MB)
MAX_CONCURRENT_SEARCHES = 3

# ANCHOR:platform_domains
# Used by build_scoped_query() as fallback; only covers search-provider platforms.
PLATFORM_DOMAINS = {
    "wallapop":    "es.wallapop.com",
    "milanuncios": "milanuncios.com",
}


def build_scoped_query(keywords: str, platforms: list, location: str = None) -> str:
    """
    Builds a search query scoped to marketplace platforms using site: operators
    joined with OR, with optional location appended.
    Example: 'iPhone 13 (site:es.wallapop.com OR site:vinted.es) Barcelona'
    """
    domains = [
        f"site:{PLATFORM_DOMAINS[p]}"
        for p in platforms
        if p in PLATFORM_DOMAINS
    ]
    if not domains:
        base = keywords
    else:
        site_filter = " OR ".join(domains)
        base = f"{keywords} ({site_filter})"
    if location:
        base = f"{base} {location}"
    return base


# ANCHOR:platform_query_templates
# Only wallapop and milanuncios — vinted uses direct REST API, ebay_es uses RSS feed.
# intitle: forces keyword to appear in listing title, eliminating parts/firmware/category pages.
PLATFORM_QUERY_TEMPLATES = {
    "wallapop": (
        'intitle:"{keywords}"'
        " site:es.wallapop.com"
        " inurl:/item/"
        " {location}"
    ),
    "milanuncios": (
        'intitle:"{keywords}"'
        " site:milanuncios.com"
        " segunda mano"
        " {location}"
    ),
    # vinted → search_vinted_direct() in search.py
    # ebay_es → search_ebay_rss() in search.py
}


def build_platform_query(keywords: str, platform: str, location: str = None) -> str:
    """
    Builds a per-platform query using intitle: + site: filters.
    Example: 'intitle:"iPhone 13" site:es.wallapop.com inurl:/item/ Barcelona'
    """
    template = PLATFORM_QUERY_TEMPLATES.get(platform)
    if not template:
        return keywords
    # Strip surrounding quotes/commas from keywords before inserting into intitle:
    clean_kw = keywords.strip().strip('"')
    loc = location or ""
    query = template.format(keywords=clean_kw, location=loc).strip()
    print(f"[QUERY] {platform}: {query}")
    return query


# ANCHOR:search_scrapingdog
def search_scrapingdog(query: str, num_results: int = 20, api_key: str = None, platforms: list = None, location: str = None) -> list:
    if platforms is None:
        platforms = list(PLATFORM_DOMAINS.keys())
    scoped_query = build_scoped_query(query, platforms, location)
    print(f"[SCRAPINGDOG] Query: {query!r} | num: {num_results}")
    print(f"[SCRAPINGDOG] Scoped query: {scoped_query}")

    key = api_key or os.getenv("SCRAPINGDOG_API_KEY")
    if not key:
        raise ValueError("No Scrapingdog key available")

    resp = requests.get(
        "https://api.scrapingdog.com/google/",
        params={
            "api_key": key,
            "query": scoped_query,
            "results": min(num_results, 100),
            "country": "es",
            "page": 0,
        },
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()

    results = [
        {
            "title": r.get("title", ""),
            "url": r.get("link", ""),
            "snippet": r.get("snippet", ""),
            "position": i,
            "search_provider": "scrapingdog",
            "platform": _detect_platform(r.get("link", "")),
        }
        for i, r in enumerate(data.get("organic_results", []))
    ]
    print(f"[SCRAPINGDOG] Raw results: {len(results)}")
    for r in results:
        print(f"  [SCRAPINGDOG URL] {r.get('url', 'MISSING')[:80]} | title: {r.get('title', '')[:40]} | platform: {r.get('platform', 'MISSING')}")
    return results


# ANCHOR:search_serpapi
def search_serpapi(query: str, num_results: int = 20, api_key: str = None, platforms: list = None, location: str = None) -> list:
    if platforms is None:
        platforms = list(PLATFORM_DOMAINS.keys())
    scoped_query = build_scoped_query(query, platforms, location)
    print(f"[SERPAPI] Query: {query!r} | num: {num_results}")
    print(f"[SERPAPI] Scoped query: {scoped_query}")

    key = api_key or os.getenv("SERPAPI_API_KEY")
    if not key:
        raise ValueError("No SerpAPI key available")

    resp = requests.get(
        "https://serpapi.com/search",
        params={
            "q": scoped_query,
            "api_key": key,
            "engine": "google",
            "gl": "es",
            "hl": "es",
            "num": min(num_results, 100),
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    results = [
        {
            "title": r.get("title", ""),
            "url": r.get("link", ""),
            "snippet": r.get("snippet", ""),
            "date": r.get("date", ""),
            "position": i,
            "search_provider": "serpapi",
            "platform": _detect_platform(r.get("link", "")),
        }
        for i, r in enumerate(data.get("organic_results", []))
    ]
    print(f"[SERPAPI] Raw results: {len(results)}")
    for r in results:
        print(f"  [SERPAPI URL] {r.get('url', 'MISSING')[:80]} | title: {r.get('title', '')[:40]} | platform: {r.get('platform', 'MISSING')}")
    return results


# ANCHOR:search_serper
def search_serper(query: str, num_results: int = 20, api_key: str = None, platforms: list = None, location: str = None) -> list:
    if platforms is None:
        platforms = list(PLATFORM_DOMAINS.keys())
    scoped_query = build_scoped_query(query, platforms, location)
    print(f"[SERPER] Query: {query!r} | num: {num_results}")
    print(f"[SERPER] Scoped query: {scoped_query}")

    key = api_key or os.getenv("SERPER_API_KEY")
    if not key:
        raise ValueError("No Serper key available")

    resp = requests.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": key, "Content-Type": "application/json"},
        json={"q": scoped_query, "gl": "es", "hl": "es", "num": min(num_results, 100)},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    results = [
        {
            "title": r.get("title", ""),
            "url": r.get("link", ""),
            "snippet": r.get("snippet", ""),
            "date": r.get("date", ""),
            "position": i,
            "search_provider": "serper",
            "platform": _detect_platform(r.get("link", "")),
        }
        for i, r in enumerate(data.get("organic", []))
    ]
    print(f"[SERPER] Raw results: {len(results)}")
    for r in results:
        print(f"  [SERPER URL] {r.get('url', 'MISSING')[:80]} | title: {r.get('title', '')[:40]} | platform: {r.get('platform', 'MISSING')}")
    return results


# ANCHOR:keyword_split
def split_keywords(keywords: str) -> list:
    """
    Split comma-separated keyword variants into individual search terms.
    Strips whitespace and empty strings. Max 5 variants to control credit usage.
    """
    variants = [k.strip() for k in keywords.split(",") if k.strip()]
    return variants[:5]


# ANCHOR:search_with_personal_keys
def search_with_personal_keys(query: str, num_results: int, uid: str, platforms: list = None, location: str = None) -> dict | None:
    db = firestore.client()
    user_doc = db.collection("users").document(uid).get()

    if not user_doc.exists:
        return None

    sp = user_doc.to_dict().get("searchProviders", {})

    personal_enabled = [
        p
        for p in ["scrapingdog", "serpapi", "serper"]
        if sp.get(p, {}).get("enabled") is True
        and sp.get(p, {}).get("apiKey") is not None
    ]

    if not personal_enabled:
        return None

    # ANCHOR:personal_keys_entry_log
    print(f"[PERSONAL KEYS] Starting search for: {query!r}")
    print(f"[PERSONAL KEYS] Active providers: {personal_enabled}")
    print(f"[PERSONAL KEYS] Platforms: {platforms}")
    print(f"[PERSONAL KEYS] Location: {location!r}")

    funcs = {
        "scrapingdog": search_scrapingdog,
        "serpapi": search_serpapi,
        "serper": search_serper,
    }

    active_platforms = platforms or list(PLATFORM_DOMAINS.keys())

    # ANCHOR:personal_keys_platform_skip
    # Filter to only search-provider-supported platforms; others use native APIs
    provider_platforms = [p for p in active_platforms if p in SEARCH_PROVIDER_PLATFORMS][:2]
    skipped = [p for p in active_platforms if p not in SEARCH_PROVIDER_PLATFORMS]
    for p in skipped:
        print(f"[PERSONAL KEYS] Skipping {p} — uses native API (vinted→REST, ebay_es→RSS)")
    if not provider_platforms:
        return None

    per_platform = max(2, num_results // len(provider_platforms))

    _all_variants = split_keywords(query)
    variants = _all_variants[:2]
    if len(_all_variants) > 2:
        print(f"[SEARCH] Processing 2/{len(_all_variants)} variants (capped for memory)")
    print(f"[PERSONAL KEYS] Split into {len(variants)} variants: {variants}")
    MAX_PER_PLATFORM = 10

    all_results = []
    # ANCHOR:personal_keys_per_platform
    # Per (platform, variant): try highest-priority provider only.
    # Fall back to second provider only if first got 0 results AND time budget allows.
    # Scrapingdog Phase 2: sequential, only where priority got < 3 results.
    # Hard limits: 2 variants, 2 platforms, 25s budget.
    platform_seen: dict = {}
    platform_count: dict = {}
    priority_counts: dict = {}
    providers_used: set = set()

    priority_providers = [p for p in ["serper", "serpapi"] if p in personal_enabled]
    scrapingdog_enabled = "scrapingdog" in personal_enabled

    _budget = 25
    _search_start = time.time()
    print(f"[DISCOVERY] Starting with {len(variants)} variants, {len(provider_platforms)} platforms, budget={_budget}s")

    def _collect_results(provider_results, p, platform, variant):
        key = (platform, variant)
        if platform not in platform_seen:
            platform_seen[platform] = set()
            platform_count[platform] = 0
        added = 0
        for r in provider_results:
            url_norm = r.get("url", "").rstrip("/").lower().split("?")[0]
            if url_norm and url_norm not in platform_seen[platform] and platform_count[platform] < MAX_PER_PLATFORM:
                platform_seen[platform].add(url_norm)
                platform_count[platform] += 1
                all_results.append(r)
                added += 1
        priority_counts[key] = priority_counts.get(key, 0) + added
        # ANCHOR:personal_keys_usage_thread
        if p not in providers_used:
            providers_used.add(p)
            threading.Thread(target=increment_usage, args=(uid, p), daemon=True).start()

    if priority_providers:
        _timed_out = False
        for platform in provider_platforms:
            if _timed_out:
                break
            for variant in variants:
                if time.time() - _search_start > _budget:
                    print(f"[DISCOVERY] Time budget exceeded, stopping search early")
                    _timed_out = True
                    break
                variant_query = build_platform_query(variant, platform, location)
                print(f"[PERSONAL KEYS] Variant query for {platform}: {variant_query[:80]}")
                # Try only highest-priority provider
                first_p = priority_providers[0]
                got_results = 0
                try:
                    provider_results = funcs[first_p](
                        variant_query, per_platform,
                        decrypt_key(sp[first_p]["apiKey"]), [], None,
                    )
                    print(f"[SEARCH_PROVIDER] {first_p} for {platform}/{variant!r}: {len(provider_results)} results")
                    _collect_results(provider_results, first_p, platform, variant)
                    got_results = len(provider_results)
                except Exception as e:
                    print(f"[search_provider] {first_p} for {platform}/{variant!r} failed: {e}")
                time.sleep(0.5)
                # Fall back to second provider only if 0 results AND budget allows
                if got_results == 0 and len(priority_providers) > 1 and time.time() - _search_start <= _budget:
                    second_p = priority_providers[1]
                    try:
                        provider_results = funcs[second_p](
                            variant_query, per_platform,
                            decrypt_key(sp[second_p]["apiKey"]), [], None,
                        )
                        print(f"[SEARCH_PROVIDER] {second_p} fallback for {platform}/{variant!r}: {len(provider_results)} results")
                        _collect_results(provider_results, second_p, platform, variant)
                    except Exception as e:
                        print(f"[search_provider] {second_p} for {platform}/{variant!r} failed: {e}")
                    time.sleep(0.5)

    if scrapingdog_enabled:
        for platform in provider_platforms:
            for variant in variants:
                if time.time() - _search_start > _budget:
                    print(f"[DISCOVERY] Time budget exceeded, stopping search early")
                    break
                key = (platform, variant)
                if priority_counts.get(key, 0) >= 3:
                    print(f"[SCRAPINGDOG] Skipping {platform}/{variant!r} — priority providers got {priority_counts[key]} results")
                    continue
                variant_query = build_platform_query(variant, platform, location)
                print(f"[SCRAPINGDOG] Running for {platform}/{variant!r} (priority got {priority_counts.get(key, 0)} results)")
                try:
                    provider_results = funcs["scrapingdog"](
                        variant_query, per_platform,
                        decrypt_key(sp["scrapingdog"]["apiKey"]), [], None,
                    )
                    print(f"[SEARCH_PROVIDER] scrapingdog for {platform}/{variant!r}: {len(provider_results)} results")
                    _collect_results(provider_results, "scrapingdog", platform, variant)
                except Exception as e:
                    print(f"[search_provider] scrapingdog for {platform}/{variant!r} failed: {e}")
                time.sleep(1.5)

    if not all_results:
        return None

    # ANCHOR:personal_keys_dedup
    seen = set()
    deduped = []
    for r in all_results:
        norm = r.get("url", "").rstrip("/").lower().split("?")[0]
        if norm and norm not in seen:
            seen.add(norm)
            deduped.append(r)

    # ANCHOR:personal_keys_dedup_log
    print(f"[DISCOVERY] Completed in {time.time() - _search_start:.1f}s, {len(deduped)} results")
    print(f"[PERSONAL KEYS] Total results after merge: {len(deduped)} (from {len(all_results)} before dedup)")
    for r in deduped:
        print(f"  [MERGED URL] {r.get('url', 'MISSING')[:80]} | platform: {r.get('platform', 'MISSING')}")
    return {
        "results": deduped,
        "source": "personal",
        "active_providers": personal_enabled,
    }
