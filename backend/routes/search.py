import os
import json
from curl_cffi import requests
from bs4 import BeautifulSoup
from flask import Blueprint, request, jsonify
from services.auth import require_auth, get_db
import math
import time

# Simple in-memory cache for geocoding results
GEO_CACHE = {}
CACHE_TTL = 3600 # 1 hour

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

@search_bp.route("/api/geocoder", methods=["GET"])
@require_auth
def geocode():
    query = request.args.get("q", "").strip()
    if not query or len(query) < 3:
        return jsonify([]), 400
        
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

@search_bp.route("/api/discovery", methods=["POST"])
@require_auth
def discover_listings():
    import re
    from urllib.parse import unquote
    from concurrent.futures import ThreadPoolExecutor, as_completed

    req_data = request.json or {}
    keywords = req_data.get("keywords", "").strip()
    location = req_data.get("location", "").strip()
    page = req_data.get("page", 1)
    offset = (page - 1) * 30

    if not keywords:
        return jsonify({"error": "Keywords are required"}), 400

    try:
        # Step 1: Geocode location string to lat/lon for distance-based filtering
        loc_lat, loc_lon = None, None
        if location:
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

        # Step 2: Build diverse DDG query set
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

        wallapop_urls = []

        try:
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            for query in queries:
                params = {"q": query}
                if offset > 0:
                    params["s"] = offset

                print(f"DEBUG: DDG query: {query}")
                try:
                    resp = requests.get(
                        "https://html.duckduckgo.com/html/",
                        params=params,
                        headers={"User-Agent": ua},
                        timeout=15,
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
                            elif href.startswith("//duckduckgo.com/l/?uddg="):
                                try:
                                    actual_url = unquote(href.split("uddg=")[1].split("&")[0])
                                except:
                                    continue
                            elif "es.wallapop.com/item/" in href:
                                actual_url = href if href.startswith("http") else f"https:{href}"

                            if actual_url and "wallapop.com/item/" in actual_url and actual_url not in wallapop_urls:
                                wallapop_urls.append(actual_url)
                                found_in_query += 1

                        # Regex fallback on raw HTML when link parser finds nothing
                        if found_in_query == 0:
                            for m in re.findall(r'https?%3A%2F%2F[a-z.]*wallapop\.com%2Fitem%2F[^&"\' >%]+', resp.text):
                                u = unquote(m)
                                if u not in wallapop_urls:
                                    wallapop_urls.append(u)
                                    found_in_query += 1
                            for u in re.findall(r'https?://[a-z.]*wallapop\.com/item/[^"\' >]+', resp.text):
                                if u not in wallapop_urls:
                                    wallapop_urls.append(u)
                                    found_in_query += 1

                        print(f"DEBUG: Query yielded {found_in_query} new URLs (running total: {len(wallapop_urls)})")

                    elif "bots use DuckDuckGo too" in resp.text:
                        print(f"DEBUG: DDG blocked query: {query}")

                except Exception as e:
                    print(f"DEBUG: DDG query failed: {e}")

        except Exception as e:
            print(f"DEBUG: DDG overall failed: {e}")

        # Method B: Direct Wallapop Search (Fallback)
        if len(wallapop_urls) < 5:
            try:
                print(f"DEBUG: Falling back to Direct Wallapop Search...")
                wall_search_url = f"https://es.wallapop.com/search?keywords={keywords}"
                if location:
                    wall_search_url += f"&location={location}"

                resp = requests.get(wall_search_url, headers=HEADERS, timeout=20, impersonate="chrome120")
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    script = soup.find("script", id="__NEXT_DATA__")
                    if script:
                        ndata = json.loads(script.string)
                        for slug, item_id in re.findall(r'"webSlug":"([^"]+)","id":"(\d+)"', json.dumps(ndata)):
                            u = f"https://es.wallapop.com/item/{slug}-{item_id}"
                            if u not in wallapop_urls:
                                wallapop_urls.append(u)

                    if not wallapop_urls:
                        for a in soup.find_all("a", href=True):
                            if "/item/" in a["href"] and "es.wallapop.com" in a["href"]:
                                if a["href"] not in wallapop_urls:
                                    wallapop_urls.append(a["href"])
            except Exception as e:
                print(f"DEBUG: Direct Wallapop fallback failed: {e}")

        # Dedup preserving order, cap at 60
        wallapop_urls = list(dict.fromkeys(wallapop_urls))[:60]
        print(f"DEBUG: {len(wallapop_urls)} unique candidate URLs to scrape.")

        if not wallapop_urls:
            return jsonify([])

        # Step 3: Scrape each item page in parallel
        def scrape_item(url):
            try:
                resp = requests.get(url, headers=HEADERS, timeout=20, impersonate="chrome120")
                if resp.status_code != 200:
                    return None

                soup = BeautifulSoup(resp.text, "html.parser")
                script = soup.find("script", id="__NEXT_DATA__")
                if not script:
                    return None

                next_data = json.loads(script.string)
                item_info = next_data.get("props", {}).get("pageProps", {}).get("item")
                if not item_info:
                    return None

                # Skip sold/reserved
                item_flags = item_info.get("flags", {}) or {}
                if item_flags.get("sold") or item_flags.get("reserved"):
                    return None
                item_state = str(item_info.get("state", "") or item_info.get("status", "")).lower()
                if item_state in ["sold", "reserved", "vendido", "reservado", "inactive"]:
                    return None

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

                return {
                    "item_id": str(item_info.get("id", "")),
                    "title": title,
                    "price": price,
                    "images": images,
                    "url": url,
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
                print(f"Failed to scrape {url}: {e}")
                return None

        listings = []
        with ThreadPoolExecutor(max_workers=8) as executor:
            future_to_url = {executor.submit(scrape_item, url): url for url in wallapop_urls}
            for future in as_completed(future_to_url):
                result = future.result()
                if result:
                    listings.append(result)

        # Step 4: Location filtering
        if location:
            if loc_lat and loc_lon:
                # Distance-based: keep items within 60km radius; keep items with no coords if city name loosely matches
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
                        # No coords — soft match on city name
                        item_city = item.get("location", {}).get("city", "").lower()
                        loc_lower = location.lower()
                        if loc_lower in item_city or item_city in loc_lower:
                            filtered.append(item)
                listings = filtered
            else:
                # No geocoding — bidirectional string match
                loc_lower = location.lower()
                listings = [
                    item for item in listings
                    if loc_lower in item.get("location", {}).get("city", "").lower()
                    or item.get("location", {}).get("city", "").lower() in loc_lower
                ]

        print(f"DEBUG: Discovery returning {len(listings)} listings.")
        return jsonify(listings)

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"DEBUG: Discovery failed: {error_trace}")
        return jsonify({"error": f"Discovery failed: {str(e)}", "traceback": error_trace}), 500
