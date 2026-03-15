# @flipops-map user.py — updated 2026-03-15
# OFFSET: N=26 (25 comment lines + 1 blank)
#
# IMPORTS: L27–L32
# ROUTES:
#   L48  GET    /api/user/me
#   L101 POST   /api/user/api-key
#   L119 DELETE /api/user/api-key
#   L129 PATCH  /api/user/settings
#   L146 GET    /api/user/history
#   L161 POST   /api/user/history
#   L180 PATCH  /api/user/platform-preferences
#   L197 GET    /api/user/keyword-variants
#   L223 POST   /api/user/keyword-variants
#   L244 PATCH  /api/user/keyword-variants/<variant_id>
#   L268 DELETE /api/user/keyword-variants/<variant_id>
#   L283 POST   /api/user/search-key
#   L314 PATCH  /api/user/search-key/<provider>
#   L335 DELETE /api/user/search-key/<provider>
#   L349 GET    /api/user/search-usage
# ANCHORS:
#   L51  — db = get_db() pattern (called per-route; first in get_user_me)
#   L31  — @require_auth import (services.auth; applied to every route)
#   L381 — where to add new user route (append after last route)
#   L32  — encrypt_key / decrypt_key import (services.encryption)

import os
import uuid
import datetime
from flask import Blueprint, request, jsonify
from services.auth import require_auth, get_db
from services.encryption import encrypt_key, decrypt_key

DEFAULT_KEYWORD_VARIANTS = [
    {"trigger": "TV",          "variants": ['TV 40"', 'TV 43"', 'TV 50"', 'TV 55"', 'TV 65"', "smart TV Samsung", "televisor OLED"]},
    {"trigger": "iPhone",      "variants": ["iPhone 12", "iPhone 13", "iPhone 14", "iPhone 15", "iPhone SE", "iPhone Pro"]},
    {"trigger": "iPad",        "variants": ["iPad Air", "iPad Pro", "iPad mini", "iPad 9", "iPad 10"]},
    {"trigger": "PlayStation", "variants": ["PS5", "PS4 Pro", "PS4 Slim", "mando PS5"]},
    {"trigger": "Nintendo",    "variants": ["Nintendo Switch", "Switch OLED", "Switch Lite"]},
    {"trigger": "MacBook",     "variants": ["MacBook Air M1", "MacBook Air M2", "MacBook Pro 13", "MacBook Pro 14"]},
    {"trigger": "Dyson",       "variants": ["Dyson V8", "Dyson V10", "Dyson V11", "Dyson V15", "Dyson Airwrap"]},
    {"trigger": "Bicicleta",   "variants": ["bicicleta montaña", "bicicleta eléctrica", "BTT", "gravel"]},
    {"trigger": "Cámara",      "variants": ["cámara Sony", "cámara Canon", "cámara mirrorless", "objetivo 50mm"]},
]

user_bp = Blueprint('user', __name__)

@user_bp.route("/api/user/me", methods=["GET"])
@require_auth
def get_user_me():
    db = get_db()
    uid = request.user['uid']
    user_doc = db.collection('users').document(uid).get()
    
    if not user_doc.exists:
        return jsonify({"error": "User profile not found"}), 404
        
    user_data = user_doc.to_dict()

    # Don't send the full API key, just a mask if it exists
    if user_data.get('api_key'):
        user_data['api_key_masked'] = "sk-ant-..." + decrypt_key(user_data['api_key'])[-4:]
        del user_data['api_key'] # Safety

    # Seed platformPreferences defaults on first call
    if 'platformPreferences' not in user_data:
        default_prefs = {'wallapop': True, 'vinted': True, 'milanuncios': True, 'ebay_es': True}
        user_data['platformPreferences'] = default_prefs
        db.collection('users').document(uid).update({'platformPreferences': default_prefs})

    sp = user_data.get("searchProviders", {})
    providers_out = {}
    for p in ["scrapingdog", "serpapi", "serper"]:
        pd = sp.get(p, {})
        providers_out[p] = {
            "enabled": pd.get("enabled", False),
            "hasKey": pd.get("apiKey") is not None,
            "addedAt": pd.get("addedAt"),
            "lastUsedAt": pd.get("lastUsedAt"),
        }
    active = [p for p in providers_out if providers_out[p]["enabled"] and providers_out[p]["hasKey"]]
    user_data["searchProviders"] = providers_out
    user_data["activeSearchProviders"] = active
    user_data["usingPersonalSearch"] = len(active) > 0

    from services.usage_tracker import get_searches_remaining
    low_providers = []
    for p in ["scrapingdog", "serpapi", "serper"]:
        pd = sp.get(p, {})
        if pd.get("enabled") and pd.get("apiKey") is not None:
            usage = pd.get("usage", {})
            if get_searches_remaining(p, usage) <= 5:
                low_providers.append(p)
    user_data["searchUsageSummary"] = {
        "anyLowCredits": len(low_providers) > 0,
        "lowProviders": low_providers,
    }

    return jsonify(user_data)

@user_bp.route("/api/user/api-key", methods=["POST"])
@require_auth
def set_user_api_key():
    db = get_db()
    uid = request.user['uid']
    data = request.json
    api_key = data.get('api_key')
    
    if not api_key:
        return jsonify({"error": "API key required"}), 400
        
    encrypted = encrypt_key(api_key)
    db.collection('users').document(uid).update({
        'api_key': encrypted
    })
    
    return jsonify({"message": "API key saved successfully"})

@user_bp.route("/api/user/api-key", methods=["DELETE"])
@require_auth
def delete_user_api_key():
    db = get_db()
    uid = request.user['uid']
    db.collection('users').document(uid).update({
        'api_key': None
    })
    return jsonify({"message": "API key removed successfully"})

@user_bp.route("/api/user/settings", methods=["PATCH"])
@require_auth
def update_user_settings():
    db = get_db()
    uid = request.user['uid']
    data = request.json
    
    # List of allowed settings to update
    allowed_keys = ['default_tone', 'dailyCap', 'preferred_language', 'locations', 'custom_negotiation_prompt', 'custom_listing_prompt', 'custom_batch_prompt', 'custom_discussion_prompt', 'negotiation_language', 'saved_searches', 'recent_searches']
    update_data = {k: v for k, v in data.items() if k in allowed_keys}
    
    if not update_data:
        return jsonify({"message": "No valid settings to update"}), 200
        
    db.collection('users').document(uid).update(update_data)
    return jsonify({"message": "Settings updated successfully", "updated": update_data})

@user_bp.route("/api/user/history", methods=["GET"])
@require_auth
def get_user_history():
    db = get_db()
    uid = request.user['uid']
    history_ref = db.collection('users').document(uid).collection('history')
    docs = history_ref.order_by('timestamp', direction='DESCENDING').limit(20).get()
    
    history = []
    for doc in docs:
        item = doc.to_dict()
        item['id'] = doc.id
        history.append(item)
    return jsonify(history)

@user_bp.route("/api/user/history", methods=["POST"])
@require_auth
def save_user_history():
    db = get_db()
    uid = request.user['uid']
    data = request.json
    
    item_id = data.get('item_id', str(int(os.urandom(4).hex(), 16)))
    history_ref = db.collection('users').document(uid).collection('history').document(item_id)
    
    import datetime
    data['timestamp'] = datetime.datetime.now().isoformat()
    # Default action if not present
    if 'action' not in data:
        data['action'] = 'Discarded'
        
    history_ref.set(data, merge=True)
    return jsonify({"message": "History saved", "id": item_id})

@user_bp.route("/api/user/platform-preferences", methods=["PATCH"])
@require_auth
def update_platform_preference():
    db = get_db()
    uid = request.user['uid']
    data = request.json
    platform = data.get('platform')
    enabled = data.get('enabled')
    if platform is None or enabled is None:
        return jsonify({"error": "platform and enabled required"}), 400
    default_prefs = {'wallapop': True, 'vinted': True, 'milanuncios': True, 'ebay_es': True}
    user_doc = db.collection('users').document(uid).get()
    current = user_doc.to_dict().get('platformPreferences', default_prefs) if user_doc.exists else default_prefs
    current[platform] = bool(enabled)
    db.collection('users').document(uid).update({'platformPreferences': current})
    return jsonify({"success": True, "platformPreferences": current})

@user_bp.route("/api/user/keyword-variants", methods=["GET"])
@require_auth
def get_keyword_variants():
    db = get_db()
    uid = request.user['uid']
    user_doc = db.collection('users').document(uid).get()
    if not user_doc.exists:
        return jsonify([])
    variants = user_doc.to_dict().get('keywordVariants', [])
    if not variants:
        now = datetime.datetime.now().isoformat()
        variants = [
            {
                "id": str(uuid.uuid4()),
                "trigger": d["trigger"],
                "variants": d["variants"],
                "enabled": True,
                "createdAt": now,
                "lastEditedAt": now,
                "source": "ai"
            }
            for d in DEFAULT_KEYWORD_VARIANTS
        ]
        db.collection('users').document(uid).update({'keywordVariants': variants})
    return jsonify(variants)

@user_bp.route("/api/user/keyword-variants", methods=["POST"])
@require_auth
def create_keyword_variant():
    db = get_db()
    uid = request.user['uid']
    data = request.json
    now = datetime.datetime.now().isoformat()
    new_group = {
        "id": str(uuid.uuid4()),
        "trigger": data.get("trigger", ""),
        "variants": data.get("variants", []),
        "enabled": data.get("enabled", True),
        "createdAt": now,
        "lastEditedAt": now,
        "source": data.get("source", "user")
    }
    user_doc = db.collection('users').document(uid).get()
    existing = user_doc.to_dict().get('keywordVariants', []) if user_doc.exists else []
    db.collection('users').document(uid).update({'keywordVariants': existing + [new_group]})
    return jsonify(new_group), 201

@user_bp.route("/api/user/keyword-variants/<variant_id>", methods=["PATCH"])
@require_auth
def update_keyword_variant(variant_id):
    db = get_db()
    uid = request.user['uid']
    data = request.json
    user_doc = db.collection('users').document(uid).get()
    if not user_doc.exists:
        return jsonify({"error": "User not found"}), 404
    variants = user_doc.to_dict().get('keywordVariants', [])
    updated = None
    for i, v in enumerate(variants):
        if v.get('id') == variant_id:
            if 'trigger' in data:  variants[i]['trigger'] = data['trigger']
            if 'variants' in data: variants[i]['variants'] = data['variants']
            if 'enabled' in data:  variants[i]['enabled'] = data['enabled']
            variants[i]['lastEditedAt'] = datetime.datetime.now().isoformat()
            updated = variants[i]
            break
    if not updated:
        return jsonify({"error": "Variant group not found"}), 404
    db.collection('users').document(uid).update({'keywordVariants': variants})
    return jsonify(updated)

@user_bp.route("/api/user/keyword-variants/<variant_id>", methods=["DELETE"])
@require_auth
def delete_keyword_variant(variant_id):
    db = get_db()
    uid = request.user['uid']
    user_doc = db.collection('users').document(uid).get()
    if not user_doc.exists:
        return jsonify({"error": "User not found"}), 404
    variants = [v for v in user_doc.to_dict().get('keywordVariants', []) if v.get('id') != variant_id]
    db.collection('users').document(uid).update({'keywordVariants': variants})
    return jsonify({"success": True})


_SEARCH_KEY_PROVIDERS = {"scrapingdog", "serpapi", "serper"}

@user_bp.route("/api/user/search-key", methods=["POST"])
@require_auth
def add_search_key():
    from services.search_provider import search_scrapingdog, search_serpapi, search_serper
    db = get_db()
    uid = request.user['uid']
    data = request.json or {}
    provider = data.get("provider", "")
    api_key = data.get("apiKey", "")

    if provider not in _SEARCH_KEY_PROVIDERS:
        return jsonify({"error": "Invalid provider"}), 400
    if not api_key or not isinstance(api_key, str) or len(api_key) <= 10:
        return jsonify({"error": "apiKey must be a non-empty string longer than 10 characters"}), 400

    funcs = {"scrapingdog": search_scrapingdog, "serpapi": search_serpapi, "serper": search_serper}
    try:
        result = funcs[provider]("iphone", 3, api_key)
        if not result:
            raise ValueError("empty")
    except Exception:
        return jsonify({"error": "key_invalid", "message": "Could not verify this key."}), 400

    encrypted = encrypt_key(api_key)
    db.collection("users").document(uid).update({
        f"searchProviders.{provider}.apiKey": encrypted,
        f"searchProviders.{provider}.enabled": True,
        f"searchProviders.{provider}.addedAt": datetime.datetime.utcnow().isoformat(),
    })
    return jsonify({"success": True, "provider": provider})

@user_bp.route("/api/user/search-key/<provider>", methods=["PATCH"])
@require_auth
def toggle_search_key(provider):
    db = get_db()
    uid = request.user['uid']
    if provider not in _SEARCH_KEY_PROVIDERS:
        return jsonify({"error": "Invalid provider"}), 400
    data = request.json or {}
    enabled = data.get("enabled")
    if enabled is None:
        return jsonify({"error": "enabled required"}), 400
    if enabled:
        user_doc = db.collection("users").document(uid).get()
        sp = user_doc.to_dict().get("searchProviders", {}) if user_doc.exists else {}
        if sp.get(provider, {}).get("apiKey") is None:
            return jsonify({"error": "no_key"}), 400
    db.collection("users").document(uid).update({
        f"searchProviders.{provider}.enabled": bool(enabled),
    })
    return jsonify({"success": True})

@user_bp.route("/api/user/search-key/<provider>", methods=["DELETE"])
@require_auth
def delete_search_key(provider):
    db = get_db()
    uid = request.user['uid']
    if provider not in _SEARCH_KEY_PROVIDERS:
        return jsonify({"error": "Invalid provider"}), 400
    db.collection("users").document(uid).update({
        f"searchProviders.{provider}.apiKey": None,
        f"searchProviders.{provider}.enabled": False,
        f"searchProviders.{provider}.addedAt": None,
    })
    return jsonify({"success": True})

@user_bp.route("/api/user/search-usage", methods=["GET"])
@require_auth
def get_search_usage():
    from services.usage_tracker import get_searches_remaining, get_next_reset_date, PROVIDER_LIMITS
    db = get_db()
    uid = request.user['uid']
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        return jsonify({}), 404
    sp = doc.to_dict().get("searchProviders", {})
    result = {}
    for provider in ["scrapingdog", "serpapi", "serper"]:
        pd = sp.get(provider, {})
        usage = pd.get("usage", {})
        limits = PROVIDER_LIMITS[provider]
        searches_remaining = get_searches_remaining(provider, usage)
        next_reset = get_next_reset_date(provider, usage)
        result[provider] = {
            "hasKey": pd.get("apiKey") is not None,
            "enabled": pd.get("enabled", False),
            "totalRequests": usage.get("totalRequests", 0),
            "totalCreditsUsed": usage.get("totalCreditsUsed", 0),
            "monthlyRequests": usage.get("monthlyRequests", 0),
            "freeSearches": limits["free_searches"],
            "searchesRemaining": searches_remaining,
            "creditsPerSearch": limits["credits_per_search"],
            "resetType": limits["reset_type"],
            "nextResetDate": next_reset,
            "lowCredits": searches_remaining <= 5,
        }
    any_low = any(v["lowCredits"] and v["hasKey"] and v["enabled"] for v in result.values())
    low_providers = [p for p, v in result.items() if v["lowCredits"] and v["hasKey"] and v["enabled"]]
    return jsonify({"providers": result, "anyLowCredits": any_low, "lowProviders": low_providers})
