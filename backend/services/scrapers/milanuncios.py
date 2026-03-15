# @flipops-map milanuncios.py — updated 2026-03-15 — Uses named anchors
#
# ANCHOR:constants   — _BASE_URL, _SEARCH_URL, _HEADERS, _HEADERS_RETRY, _LISTING_PATTERN, _CARD_SELECTORS
# ANCHOR:search_milanuncios — main entry point:
#   Session GET search URL → BeautifulSoup → try card selectors in order →
#   per card: title, url (validate pattern), price, image, item_id →
#   403 → wait 2s + retry with alternate UA; 0 results → log HTML snippet →
#   return standard result dicts; empty list on failure (caller falls back to Google)

import re
import time
import requests
from bs4 import BeautifulSoup

# ANCHOR:constants
_BASE_URL = "https://www.milanuncios.com"
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
        resp = session.get(_SEARCH_URL, params=params, headers=_HEADERS, timeout=15)

        if resp.status_code == 403:
            print("[MILANUNCIOS] 403 received — retrying with alternate UA")
            time.sleep(2)
            resp = session.get(_SEARCH_URL, params=params, headers=_HEADERS_RETRY, timeout=15)
            if resp.status_code == 403:
                print("[MILANUNCIOS] 403 on retry — falling back to Google")
                return []

        if resp.status_code != 200:
            print(f"[MILANUNCIOS] Direct scrape failed: {resp.status_code} — falling back to Google")
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
