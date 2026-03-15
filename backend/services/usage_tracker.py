# @flipops-map usage_tracker.py — updated 2026-03-15
# OFFSET: N=19 (18 comment lines + 1 blank)
#
# IMPORTS: L20
# CONSTANTS:
#   L22 PROVIDER_LIMITS — free tier limits per provider (credits, reset type, reset day)
# FUNCTIONS:
#   L47 get_searches_remaining(provider, usage) — remaining = (free_credits - totalCreditsUsed) // credits_per_search
#   L54 get_next_reset_date(provider, usage) — ISO date string or None;
#           fixed day (Serper) or signup anniversary (SerpAPI)
#   L90 _should_reset_monthly(usage) — True if lastResetDate != current YYYY-MM
#   L96 increment_usage(uid, provider) — Firestore write; never raises; called in background thread
# ANCHORS:
#   L50 — credit calculation: max(0, free_credits - totalCreditsUsed) // credits_per_search
#   L124 — monthly reset check (_should_reset_monthly → resets monthlyRequests/Credits)
#   L118 — Firestore update dict construction (updates = {...})
#   L22 — PROVIDER_LIMITS where to add new entry
#   L134 — error catch (never raises; prints to stdout)

import datetime

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
}


def get_searches_remaining(provider: str, usage: dict) -> int:
    limits = PROVIDER_LIMITS[provider]
    credits_used = usage.get("totalCreditsUsed", 0)
    remaining = max(0, limits["free_credits"] - credits_used)
    return remaining // limits["credits_per_search"]


def get_next_reset_date(provider: str, usage: dict) -> str | None:
    limits = PROVIDER_LIMITS[provider]

    if limits["reset_type"] == "never":
        return None

    today = datetime.date.today()

    if limits["reset_day"] is not None:
        # Resets on fixed day (Serper = 1st)
        if today.day >= limits["reset_day"]:
            if today.month == 12:
                next_reset = datetime.date(today.year + 1, 1, limits["reset_day"])
            else:
                next_reset = datetime.date(today.year, today.month + 1, limits["reset_day"])
        else:
            next_reset = datetime.date(today.year, today.month, limits["reset_day"])
        return next_reset.isoformat()
    else:
        # Resets on signup anniversary (SerpAPI)
        added_at = usage.get("addedAt")
        if not added_at:
            return None
        try:
            signup = datetime.datetime.fromisoformat(added_at).date()
            candidate = datetime.date(today.year, today.month, signup.day)
            if candidate <= today:
                if today.month == 12:
                    candidate = datetime.date(today.year + 1, 1, signup.day)
                else:
                    candidate = datetime.date(today.year, today.month + 1, signup.day)
            return candidate.isoformat()
        except Exception:
            return None


def _should_reset_monthly(usage: dict) -> bool:
    last_reset = usage.get("lastResetDate", "")
    current = datetime.date.today().strftime("%Y-%m")
    return last_reset != current


def increment_usage(uid: str, provider: str):
    """Increment usage counters for a provider after a successful search.
    Called in a background thread — never raises."""
    try:
        from firebase_admin import firestore
        db = firestore.client()
        ref = db.collection("users").document(uid)

        limits = PROVIDER_LIMITS.get(provider)
        if not limits:
            return

        credits = limits["credits_per_search"]
        prefix = f"searchProviders.{provider}"

        doc = ref.get()
        if not doc.exists:
            return

        sp = doc.to_dict().get("searchProviders", {})
        usage = sp.get(provider, {}).get("usage", {})

        updates = {
            f"{prefix}.lastUsedAt": datetime.datetime.utcnow().isoformat(),
            f"{prefix}.usage.totalRequests": firestore.Increment(1),
            f"{prefix}.usage.totalCreditsUsed": firestore.Increment(credits),
        }

        if _should_reset_monthly(usage):
            updates[f"{prefix}.usage.monthlyRequests"] = 1
            updates[f"{prefix}.usage.monthlyCreditsUsed"] = credits
            updates[f"{prefix}.usage.lastResetDate"] = datetime.date.today().strftime("%Y-%m")
        else:
            updates[f"{prefix}.usage.monthlyRequests"] = firestore.Increment(1)
            updates[f"{prefix}.usage.monthlyCreditsUsed"] = firestore.Increment(credits)

        ref.update(updates)

    except Exception as e:
        print(f"[usage_tracker] increment failed for {provider}: {e}")
