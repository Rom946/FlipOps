# @flipops-map milanuncios.py — updated 2026-03-16 — Uses named anchors
#
# ANCHOR:constants          — _BASE_URL, _SEARCH_URL, _HEADERS, _HEADERS_RETRY, _LISTING_PATTERN, _CARD_SELECTORS
# ANCHOR:item_id_re         — _ITEM_ID_RE: r'-(\d{5,})\.htm' — used by scrape_milanuncios_page
# ANCHOR:search_milanuncios — main entry point: direct search page scrape
#   curl_cffi Session GET (impersonate=chrome110) → BeautifulSoup → try card selectors in order →
#   per card: title, url (validate _LISTING_PATTERN), price, image, item_id →
#   403/405 → wait 2s + retry with chrome124; 0 results → log HTML snippet →
#   return standard result dicts; empty list on failure (caller falls back to Google)
# ANCHOR:scrape_milanuncios_page — scrape a category/listing page URL and extract individual ads
#   used when DDG returns category pages instead of direct listing URLs
#   GET with _HEADERS + session → BeautifulSoup → _CARD_SELECTORS → per card extract
#   only keeps cards with numeric item_id (5+ digits) in URL
#   returns list of listing dicts (search_provider="category_scrape")

import re
import time
from curl_cffi import requests
from bs4 import BeautifulSoup

# ANCHOR:constants
_BASE_URL = "https://www.milanuncios.com"
# ANCHOR:item_id_re
_ITEM_ID_RE = re.compile(r'-(\d{5,})\.htm')
_SEARCH_URL = f"{_BASE_URL}/anuncios/"
_LISTING_PATTERN = re.compile(r'-\d{6,}\.htm$')
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "es-ES,es;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0",
}
_HEADERS_RETRY = {
    **_HEADERS,
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
}
_CARD_SELECTORS = [
    "article.ma-AdCard",
    ".ma-AdCard",
    "[class*='AdCard']",
    "article[data-adid]",
    "div[class*='adcard']",
]


# ANCHOR:search_milanuncios
def search_milanuncios(keywords: str, max_results: int = 20) -> list:
    """Direct scrape of Milanuncios search results page.

    Returns list of listing dicts in standard discovery format.
    Returns empty list on failure — caller falls back to Google providers.
    """
    params = {"s": keywords, "orden": "relevance", "vendido": "false"}

    session = requests.Session()

    try:
        resp = session.get(_SEARCH_URL, params=params, headers=_HEADERS, timeout=15, impersonate="chrome110")

        if resp.status_code in (403, 405):
            print(f"[MILANUNCIOS] {resp.status_code} received — retrying with alternate UA")
            time.sleep(2)
            resp = session.get(_SEARCH_URL, params=params, headers=_HEADERS_RETRY, timeout=15, impersonate="chrome124")
            if resp.status_code != 200:
                print(f"[MILANUNCIOS] {resp.status_code} on retry — falling back to Google")
                return []

        if resp.status_code != 200:
            print(f"[MILANUNCIOS] Direct scrape failed: {resp.status_code} — falling back to Google\n"
                  f"[MILANUNCIOS] HTML snippet: {resp.text[:300]!r}")
            return []

    except Exception as e:
        print(f"[MILANUNCIOS] Direct scrape failed: {e} — falling back to Google")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try each selector until one yields cards
    cards = []
    for selector in _CARD_SELECTORS:
        cards = soup.select(selector)
        if cards:
            print(f"[MILANUNCIOS] Found {len(cards)} cards with selector: {selector!r}")
            break

    if not cards:
        print(
            f"[MILANUNCIOS] No listing cards found — falling back to Google\n"
            f"[MILANUNCIOS] Response status: {resp.status_code} | "
            f"HTML snippet: {resp.text[:500]!r}"
        )
        return []

    results = []
    for card in cards[:max_results]:
        try:
            # URL — must match listing pattern
            link_el = card.find("a", href=True)
            if not link_el:
                continue
            href = link_el["href"]
            if href.startswith("http"):
                full_url = href
            elif href.startswith("/"):
                full_url = _BASE_URL + href
            else:
                full_url = _BASE_URL + "/" + href

            if not _LISTING_PATTERN.search(full_url):
                continue

            # item_id from URL
            m = re.search(r'-(\d{6,})\.htm', full_url)
            if not m:
                continue
            item_id = m.group(1)

            # Title
            title_el = (
                card.find(["h2", "h3", "h4"])
                or card.find(class_=re.compile(r'[Tt]itle|[Tt]itulo'))
            )
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            # Price
            price_el = (
                card.find(class_=re.compile(r'[Pp]rice|[Pp]recio'))
                or card.find(attrs={"itemprop": "price"})
            )
            price = None
            if price_el:
                price_text = price_el.get_text(strip=True)
                price_clean = re.sub(r'[^\d,.]', '', price_text).replace(',', '.')
                try:
                    price = float(price_clean) if price_clean else None
                except ValueError:
                    price = None

            # Image
            img_el = card.find("img")
            image = None
            if img_el:
                image = (
                    img_el.get("src")
                    or img_el.get("data-src")
                    or img_el.get("data-lazy-src")
                )

            # Location
            loc_el = card.find(class_=re.compile(r'[Ll]ocation|[Ll]ocalidad|[Ll]ugar'))
            city = loc_el.get_text(strip=True) if loc_el else "España"

            results.append({
                "item_id": item_id,
                "title": title,
                "price": price,
                "url": full_url,
                "images": [image] if image else [],
                "platform": "milanuncios",
                "status": "",
                "seller": {"name": "", "id": "", "type": "individual", "web_slug": ""},
                "location": {"city": city, "lat": None, "lon": None},
                "condition": "",
                "description": "",
                "search_provider": "direct",
            })
        except Exception as e:
            print(f"[MILANUNCIOS] Error parsing card: {e}")
            continue

    print(f"[MILANUNCIOS] Direct scrape: {len(results)} results")
    return results


# ANCHOR:scrape_milanuncios_page
def scrape_milanuncios_page(url: str, session=None) -> list:
    """Scrape a Milanuncios category or search page, extracting individual listing dicts.

    Used when DDG/Google returns category pages instead of direct listing URLs.
    Returns list of listing dicts in standard discovery format.
    Returns empty list on failure.
    """
    if session is None:
        session = requests.Session()

    try:
        resp = session.get(url, headers=_HEADERS, timeout=15, impersonate="chrome110")
        if resp.status_code in (403, 405):
            time.sleep(1)
            resp = session.get(url, headers=_HEADERS_RETRY, timeout=15, impersonate="chrome124")
        if resp.status_code != 200:
            print(f"[MILANUNCIOS] scrape_milanuncios_page {resp.status_code}: {url[:80]}")
            return []
    except Exception as e:
        print(f"[MILANUNCIOS] scrape_milanuncios_page failed: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    cards = []
    for selector in _CARD_SELECTORS:
        cards = soup.select(selector)
        if cards:
            print(f"[MILANUNCIOS] scrape_milanuncios_page: {len(cards)} cards with {selector!r}")
            break

    if not cards:
        print(f"[MILANUNCIOS] scrape_milanuncios_page: no cards at {url[:80]}")
        return []

    results = []
    for card in cards:
        try:
            # Find link containing /anuncios/ path or numeric ID suffix
            link_el = None
            for a in card.find_all("a", href=True):
                href = a["href"]
                if "/anuncios/" in href or _ITEM_ID_RE.search(href):
                    link_el = a
                    break
            if not link_el:
                link_el = card.find("a", href=True)
            if not link_el:
                continue

            href = link_el["href"]
            if href.startswith("http"):
                full_url = href
            elif href.startswith("/"):
                full_url = _BASE_URL + href
            else:
                full_url = _BASE_URL + "/" + href

            m = _ITEM_ID_RE.search(full_url)
            if not m:
                continue
            item_id = m.group(1)

            # Title
            title_el = (
                card.find(["h2", "h3", "h4"])
                or card.find(class_=re.compile(r'[Tt]itle|[Tt]itulo'))
            )
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            # Price — try dedicated element, then scan card text for € symbol
            price_el = (
                card.find(class_=re.compile(r'[Pp]rice|[Pp]recio'))
                or card.find(attrs={"itemprop": "price"})
            )
            price = None
            if price_el:
                price_text = price_el.get_text(strip=True)
                price_clean = re.sub(r'[^\d,.]', '', price_text).replace(',', '.')
                try:
                    price = float(price_clean) if price_clean else None
                except ValueError:
                    price = None
            if price is None:
                euro_m = re.search(r'([\d.,]+)\s*€', card.get_text())
                if euro_m:
                    try:
                        price = float(euro_m.group(1).replace('.', '').replace(',', '.'))
                    except ValueError:
                        price = None

            # Image
            img_el = card.find("img")
            image = None
            if img_el:
                image = (
                    img_el.get("src")
                    or img_el.get("data-src")
                    or img_el.get("data-lazy-src")
                )

            # Location
            loc_el = card.find(class_=re.compile(r'[Ll]ocation|[Ll]ocalidad|[Ll]ugar'))
            city = loc_el.get_text(strip=True) if loc_el else "España"

            results.append({
                "item_id": item_id,
                "title": title,
                "price": price,
                "url": full_url,
                "images": [image] if image else [],
                "platform": "milanuncios",
                "status": "",
                "seller": {"name": "", "id": "", "type": "individual", "web_slug": ""},
                "location": {"city": city, "lat": None, "lon": None},
                "condition": "",
                "description": "",
                "search_provider": "category_scrape",
            })
        except Exception as e:
            print(f"[MILANUNCIOS] scrape_milanuncios_page card error: {e}")
            continue

    print(f"[MILANUNCIOS] scrape_milanuncios_page: {len(results)} listings from {url[:80]}")
    return results
