# @flipops-map negotiate.py — updated 2026-03-15
#
# ROUTES:
#   ANCHOR:route_analyze_listing — POST /api/analyze-listing
#   ANCHOR:route_batch_analyze   — POST /api/batch-analyze
#   ANCHOR:route_discussion      — POST /api/discussion/generate
#
# ANCHORS (analyze-listing):
#   ANCHOR:key_resolver_import   — key_resolver import; resolve_api_key() call
#   ANCHOR:analyze_prompt        — Claude prompt (f-string; product context + rules)
#   ANCHOR:analyze_schema        — JSON schema block (Return ONLY JSON block)
#   ANCHOR:analyze_parse         — response parsing (raw_content.find('{') + json.loads)
#
# ANCHORS (batch-analyze):
#   ANCHOR:batch_analyze_entry   — route entry; items/key/lang setup; ALL items sent (no price filter)
#   ANCHOR:batch_prompt          — batch scoring prompt (f-string, steps 1-4); max_tokens=4000
#                                  null price → verdict:"investigate", score capped at 60, target_buy=0
#                                  verdict options: buy|negotiate|pass|filtered|investigate
#   ANCHOR:batch_raw_response    — raw response from Claude
#   ANCHOR:batch_json_parse      — JSON extraction block
#   ANCHOR:batch_response        — return jsonify(results)

import os
import re
import json
import time
import anthropic
import httpx
import traceback
from flask import Blueprint, request, jsonify
from services.auth import require_auth, get_db


def extract_json_from_response(raw):
    """Extract JSON array from Claude response, handling markdown fences and extra text."""
    try:
        return json.loads(raw)
    except Exception:
        pass
    stripped = re.sub(r'```(?:json)?\s*', '', raw).strip()
    try:
        return json.loads(stripped)
    except Exception:
        pass
    m = re.search(r'\[.*\]', stripped, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    raise ValueError("No valid JSON array found in response")
# ANCHOR:key_resolver_import
from services.key_resolver import resolve_api_key

negotiate_bp = Blueprint("negotiate", __name__)


@negotiate_bp.route("/api/analyze-listing", methods=["POST"])
@require_auth
def analyze_listing():
    try:
        data = request.get_json() or {}
        print(f"DEBUG: analyze_listing hit. Data: {data}")
        uid = request.user['uid']
        api_key, key_type = resolve_api_key(uid)
        
        if not api_key:
            return jsonify({"error": f"API Key Error: {key_type}"}), 403

        client = anthropic.Anthropic(api_key=api_key, http_client=httpx.Client())
        
        product = data.get("product", "")
        listed_price = data.get("listed_price", 0)
        target_price = data.get("target_price", 0)
        target_margin = data.get("target_margin", 20)
        tone = data.get("tone", "friendly")
        description = data.get("description", "")
        condition = data.get("condition", "Buen estado")
        
        if not product:
            return jsonify({"error": "Product name is required"}), 400

        tone_guide = {
            "friendly": "amigable y cercano",
            "firm": "directo y seguro",
            "curious": "curioso e interesado",
        }
        tone_desc = tone_guide.get(tone, tone_guide["friendly"])

        preferred_language_code = data.get("preferred_language", "en")
        negotiation_language_code = data.get("negotiation_language", "es")
        
        lang_map = {"en": "English", "es": "Spanish (Spain)", "ca": "Catalan"}
        pref_lang = lang_map.get(preferred_language_code, "English")
        neg_lang = lang_map.get(negotiation_language_code, "Spanish (Spain)")

        # Fetch custom prompt from user settings if available
        db = get_db()
        user_doc = db.collection('users').document(uid).get()
        custom_prompt_instr = ""
        if user_doc.exists:
            custom_prompt_instr = user_doc.to_dict().get('custom_negotiation_prompt', '').strip()

        custom_instructions_block = ""
        if custom_prompt_instr:
            custom_instructions_block = f"\nADDITIONAL INSTRUCTIONS FROM USER: {custom_prompt_instr}\n"

        prompt = f"""Analyze this Wallapop product and provide a complete flipping strategy and negotiation plan.{custom_instructions_block}

Product: {product}
Condition: {condition}
Listed price: {listed_price}€
My target price: {target_price}€
My target margin: {target_margin}%
Negotiation tone: {tone_desc}
Seller description: {description}

Return ONLY a JSON object with this exact structure:

{{
  "negotiation": {{
    "opener": "...",
    "follow_up": "...",
    "counter_response": "...",
    "walk_away_line": "..."
  }},
  "market_data": {{
    "brand_new_price": 0,
    "brand_new_source": "...",
    "avg_second_hand_price": 0,
    "second_hand_source": "...",
    "release_date": "...",
    "price_trend": "dropping|stable|rising"
  }},
  "flip_analysis": {{
    "deal_score": 0,
    "reasoning": "...",
    "suggested_buy_max": 0,
    "suggested_resell_price": 0,
    "estimated_profit": 0,
    "real_margin_pct": 0,
    "time_to_sell_estimate": "fast (<1 week)|medium (1-3 weeks)|slow (>3 weeks)",
    "complexity": "easy|medium|hard",
    "needs_repair": false,
    "repair_estimate": 0,
    "net_profit_after_repair": 0
  }},
  "red_flags": {{
    "detected": false,
    "flags": [],
    "risk_level": "low|medium|high"
  }},
  "verdict": "buy|negotiate|pass",
  "search_variants": []
}}

CRITICAL RULES:
1. Return ONLY the JSON object. No extra text, no markdown, no code fences.
2. negotiation.opener: short natural message to send to the seller. Friendly greeting + direct offer or question. Write in {neg_lang}.
3. negotiation.follow_up: message to send if seller does not reply within 24h. More urgency, same offer. Write in {neg_lang}.
4. negotiation.counter_response: reply if seller counters between target_price and listed_price. Firm but flexible. Write in {neg_lang}.
5. negotiation.walk_away_line: polite closing message if no deal is reached. Leave door open. Write in {neg_lang}.
6. suggested_buy_max: maximum price to pay to achieve {target_margin}% margin after Wallapop fees (10%). Formula: suggested_buy_max = suggested_resell * 0.90 / (1 + {target_margin}/100)
7. suggested_resell_price: optimal resale price based on avg_second_hand_price and condition.
8. estimated_profit = suggested_resell_price * 0.90 - suggested_buy_max
9. real_margin_pct = estimated_profit / suggested_buy_max * 100
10. deal_score 0-100: >80 = excellent, buy immediately; 60-80 = good, negotiate; 40-60 = fair, only if you negotiate well; <40 = bad, pass.
11. red_flags: detect warning signals such as suspiciously low price, vague description, "no receipt needed", blocked IMEI, "sold for parts", no real photos, new account with no reviews, stolen goods signals.
12. verdict: "buy" if deal_score > 75 AND listed_price <= suggested_buy_max; "negotiate" if deal_score > 50 AND room to negotiate exists; "pass" if deal_score < 50 OR red_flags.risk_level = "high".
13. needs_repair: true only if description mentions damage, broken screen, won't turn on, faults, etc. If true, estimate repair_estimate in euros and calculate net_profit_after_repair = estimated_profit - repair_estimate.
14. price_trend: "dropping" if old model being replaced, "rising" if scarce or in demand, "stable" otherwise.
15. time_to_sell_estimate: based on product demand and category liquidity.
16. reasoning: 2-3 sentence summary explaining the deal quality, key risks, and why verdict was chosen. Write in {pref_lang}.
17. All source fields should reference credible real websites (gsmarena.com, amazon.es, ebay.es, backmarket.es, etc.)
18. search_variants: array of exactly 6 short search queries a buyer would use to find this product or similar alternatives on Wallapop. Mix: exact model, lower storage/spec variant, higher spec variant, previous generation, next generation, broader category search. Keep each under 5 words. Spanish or English based on the product name."""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        
        try:
            raw_content = message.content[0].text.strip()
            # Find the JSON start/end in case of any extra text (though prompt says ONLY json)
            start_idx = raw_content.find('{')
            end_idx = raw_content.rfind('}') + 1
            analysis_data = json.loads(raw_content[start_idx:end_idx])
            if not isinstance(analysis_data.get('search_variants'), list):
                analysis_data['search_variants'] = []
            return jsonify(analysis_data)
        except Exception as e:
            return jsonify({"error": "AI failed to return valid JSON", "details": str(e), "raw": message.content[0].text}), 502

    except ValueError as e:
        return jsonify({"error": str(e)}), 500

    except ValueError as e:
        return jsonify({"error": str(e)}), 500
    except anthropic.APIError as e:
        err_msg = str(e).lower()
        if "credit balance is too low" in err_msg or "insufficient_funds" in err_msg:
            return jsonify({"error": "AI Error: Your Anthropic credits are exhausted. Please add credits to your account (or the shared key account) to continue."}), 402
        return jsonify({"error": f"Anthropic API error: {str(e)}"}), 502
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Server error: {str(e)}", "traceback": traceback.format_exc()}), 500

# ANCHOR:batch_analyze_entry
@negotiate_bp.route("/api/batch-analyze", methods=["POST"])
@require_auth
def batch_analyze():
    try:
        data = request.get_json() or {}
        items = data.get("items", [])
        print(f"DEBUG: batch_analyze hit. Items: {len(items)}")

        uid = request.user['uid']
        api_key, key_type = resolve_api_key(uid)
        
        if not api_key:
            return jsonify({"error": f"API Key Error: {key_type}"}), 403

        client = anthropic.Anthropic(api_key=api_key, http_client=httpx.Client())
        
        # Determine language for response
        db = get_db()
        user_doc = db.collection('users').document(uid).get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        pref_lang_code = user_data.get('preferred_language', 'en')
        lang_names = {"en": "English", "es": "Spanish", "ca": "Catalan"}
        target_lang = lang_names.get(pref_lang_code, "English")

        keywords = data.get("keywords", "")
        target_margin = data.get("target_margin", 20)
        max_budget = data.get("max_budget", 9999)
        location = data.get("location", "Spain")
        if not items:
            return jsonify({"error": "No items provided"}), 400

        # Compact item list for prompt
        items_str = "\n".join([
            f"- ID: {i.get('item_id')} | Title: {i.get('title')} | Price: {str(i.get('price')) + '€' if i.get('price') else 'null'}"
            + (f" | Condition: {i.get('condition')}" if i.get('condition') else "")
            for i in items
        ])

        custom_batch_instr = user_data.get('custom_batch_prompt', '').strip()
        custom_instructions_block = f"\nADDITIONAL INSTRUCTIONS FROM USER: {custom_batch_instr}\n" if custom_batch_instr else ""

        # ANCHOR:batch_prompt
        prompt = f"""You are an expert second-hand product flipper in Spain with deep knowledge of Wallapop market prices, demand trends, and resale margins.{custom_instructions_block}

The user is searching for: "{keywords}"
User's target margin: {target_margin}%
User's max budget: {max_budget}€
User's location: {location}

Analyze the following listings and return a scored, ranked list of flip opportunities.

PRODUCTS TO ANALYZE:
{items_str}

---

STEP 1 — RELEVANCE FILTER (CRITICAL)

Before scoring, discard any listing that:
- Is not directly related to "{keywords}" (wrong category, unrelated accessory, bundle that inflates price, etc.)
- Is a professional/shop seller (repeated listings, stock photos, prices too close to retail)
- Has risk signals: no photos, new account, 0 reviews, price suspiciously below market (>50% off = likely scam)
- Is outside user's budget ({max_budget}€)
- Is a "for parts / not working" listing unless keywords explicitly mention repair/parts

Mark discarded listings with score: 0 and reason explaining why they were filtered.

---

STEP 2 — FLIP SCORE (0-100)

Score each relevant listing based on:

  Price vs market (40 points): listed price vs average second-hand market price for this exact product in this condition. More discount from market = higher score.
  Demand & liquidity (25 points): how fast does this product typically sell on Wallapop? Popular model with high search volume? Stock scarce?
  Condition quality (20 points): "Como nuevo"/"Nuevo" = full points. "Buen estado" = good. "Aceptable" or vague = lower. Mentions of damage or missing parts = penalize heavily. If condition is not provided in the listing data, assume average condition and assign a neutral score — do NOT penalize or flag it.
  Seller trust (15 points): reviews and rating if available, account age signals, quality of photos and description.

Score thresholds: 85-100 = Excellent flip — buy immediately. 70-84 = Good opportunity — negotiate to target price. 55-69 = Decent — only if you negotiate well. 40-54 = Marginal — high effort, low reward. <40 = Pass. 0 = Filtered out.

---

STEP 3 — TARGET BUY PRICE

For each relevant listing calculate:
  negotiation_discount: score 85+: 5-10% | score 70-84: 10-15% | score 55-69: 15-25% | score <55: 25%+
  max_buy_for_margin = estimated_resell * 0.90 / (1 + {target_margin}/100)
  target_buy = min(listed_price * (1 - negotiation_discount), max_buy_for_margin)

---

STEP 4 — PROFIT PROJECTION

  gross_profit = estimated_resell - target_buy
  wallapop_fee = estimated_resell * 0.10
  net_profit = gross_profit - wallapop_fee
  real_margin = net_profit / target_buy * 100

---

Return ONLY a valid JSON array. No extra text, no markdown, no code fences.

[
  {{
    "id": "...",
    "title": "...",
    "listed_price": 0,
    "score": 0,
    "verdict": "buy|negotiate|pass|filtered|investigate",
    "target_buy": 0,
    "estimated_resell": 0,
    "net_profit": 0,
    "real_margin_pct": 0,
    "time_to_sell": "fast|medium|slow",
    "reason": "2-3 sentence explanation in {target_lang}. Mention specific price vs market comparison.",
    "negotiation_angle": "One sentence in {target_lang} on how to approach the seller for this specific listing.",
    "red_flags": []
  }}
]

CRITICAL RULES:
1. Return ONLY the JSON array.
2. Sort results by score descending (best deals first).
3. Include ALL listings in output, even filtered ones (score: 0, verdict: "filtered").
4. reason and negotiation_angle must be specific to this listing — not generic text.
5. red_flags: array of specific warning strings detected in this listing. Empty array if none. Do NOT flag missing condition — it is simply not available from search results and is not a risk signal.
6. time_to_sell based on real Wallapop demand for this exact product model.
7. Be conservative with estimated_resell — use realistic Wallapop prices, not eBay or Amazon prices.
8. If listed_price is already at or below target_buy, set verdict to "buy" regardless of score threshold.
9. If Price is null: score based on title and condition only. Cap score at 60. Set verdict to "investigate". Set listed_price, target_buy, net_profit to 0. Explain in reason that price was unavailable and buyer should check before proceeding.

If the list is empty, return [].

CRITICAL: Respond with a valid JSON array ONLY. No text before or after. No markdown. No code fences. Start with [ and end with ]."""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )

        # ANCHOR:batch_raw_response
        raw = message.content[0].text.strip()
        print(f"[BATCH] Raw Claude response (first 300 chars): {raw[:300]}")

        # ANCHOR:batch_json_parse
        try:
            results = extract_json_from_response(raw)
        except Exception as e:
            print(f"[BATCH] JSON parse failed. Full raw:\n{raw}")
            return jsonify({"error": "AI failed to return batch JSON", "details": str(e), "raw": raw}), 502

        # ANCHOR:batch_response
        return jsonify(results)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Batch analysis failed: {str(e)}", "traceback": traceback.format_exc()}), 500

@negotiate_bp.route("/api/discussion/generate", methods=["POST"])
@require_auth
def generate_discussion():
    try:
        data = request.get_json() or {}
        print(f"DEBUG: generate_discussion hit. Role: {data.get('role')}")
        uid = request.user['uid']
        api_key, key_type = resolve_api_key(uid)
        
        if not api_key:
            return jsonify({"error": f"API Key Error: {key_type}"}), 403

        client = anthropic.Anthropic(api_key=api_key, http_client=httpx.Client())
        
        product_context = data.get("product", {}) # Title, Price, Description
        history = data.get("history", "") # Past messages
        last_message = data.get("last_message", "")
        role = data.get("role", "buying") # 'buying' or 'selling'
        
        # Determine language for response
        db = get_db()
        user_doc = db.collection('users').document(uid).get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        pref_lang = user_data.get('preferred_language', 'en')
        neg_lang_code = user_data.get('negotiation_language', 'es')
        
        lang_names = {"en": "English", "es": "Spanish", "ca": "Catalan"}
        target_lang = lang_names.get(neg_lang_code, "Spanish")

        # Fetch custom discussion prompt
        custom_discussion_prompt = user_data.get('custom_discussion_prompt', '')
        custom_instructions_block = f"\n\nADDITIONAL INSTRUCTIONS FROM USER:\n{custom_discussion_prompt}\n" if custom_discussion_prompt else ""

        target_price = data.get("target_price", "N/A")
        walk_away_price = data.get("walk_away_price", "N/A")
        condition = product_context.get("condition", "N/A")

        lang_names_full = {"en": "English", "es": "Spanish", "ca": "Catalan"}
        ui_lang_name = lang_names_full.get(pref_lang, "English")

        role_goal = (
            "Your goal is to get the lowest possible price while keeping the seller engaged and interested."
            if role == "buying" else
            "Your goal is to close the sale at the best possible price while building buyer confidence and urgency."
        )

        prompt = f"""You are an expert negotiation assistant for FlipOps. You help the user craft strategic, natural replies in real Wallapop conversations.{custom_instructions_block}

The user is acting as: {role}
{role_goal}

---

PRODUCT CONTEXT

Title: {product_context.get('title', 'N/A')}
Listed price: {product_context.get('price', 'N/A')}€
Condition: {condition}
Description: {product_context.get('description', 'N/A')}
User's target price: {target_price}€
User's walk-away price: {walk_away_price}€

---

CONVERSATION HISTORY

{history}

Last message received:
"{last_message}"

---

STEP 1 — SITUATION ANALYSIS

Read the full conversation and assess:
- Where are we in the negotiation? (opening / active negotiation / close to deal / stalled / deal agreed / falling apart)
- What is the counterpart's apparent stance? (flexible / firm / interested / losing interest / rushing / suspicious)
- Has a price been explicitly agreed by BOTH parties?
- Has a meeting been proposed or confirmed?
- Are there any red flags in their messages? (ghost risk, time wasters, lowball tactics, pressure tactics, scam signals)

---

STEP 2 — REPLY STRATEGY

Based on the situation, choose the optimal reply strategy:

If buying:
  - Early stage: build rapport, ask questions about condition, express genuine interest before offering
  - Mid stage: make a reasonable offer with a reason (not just a number — "I saw similar ones for X")
  - Counter stage: hold firm or split the difference, create mild urgency ("I can meet today/tomorrow")
  - Close stage: confirm details, propose meeting
  - Stalled: send a gentle follow-up or walk away line

If selling:
  - Early stage: answer questions confidently, highlight value, build trust
  - Offer received: counter strategically if too low, justify your price with condition/specs
  - Close stage: create urgency (other interested buyers, limited availability), confirm meeting details
  - Stalled: follow up with a soft nudge or sweetener

---

STEP 3 — APPOINTMENT DETECTION

Scan the full conversation for any mention of a meeting to inspect / pick up / exchange item, or specific date, time, location.

Extract if found:
  date: absolute date (calculate from today {time.strftime('%Y-%m-%d')})
  time: HH:MM format (24h). If "in one hour" and it's 23:30, date = next day, time = 00:30.
  location: place name as written
  address: full address if mentioned
  phone: phone number if shared
  reason: brief description of the meeting purpose
  type: "buy_inspect" (user is buying) or "sell_deliver" (user is selling)
  confirmed: true ONLY if BOTH parties explicitly agreed to same date + time + location

---

STEP 4 — PRICE AGREEMENT DETECTION

agreed_price rules (STRICT):
  - Only non-null when BOTH parties have explicitly confirmed the same price in the conversation
  - Seller "OK por X€" + buyer "perfecto" = agreed
  - Buyer proposing X€ with no seller confirmation = NOT agreed
  - Set to null in all ambiguous cases

---

Return ONLY valid JSON. No extra text, no markdown, no code fences.

{{
  "reply": "...",
  "reply_tone": "friendly|firm|urgent|warm|neutral",
  "situation_summary": "...",
  "negotiation_stage": "opening|negotiating|closing|agreed|stalled|dead",
  "counterpart_stance": "flexible|firm|interested|losing_interest|rushing|suspicious",
  "strategy_used": "...",
  "agreed_price": null,
  "price_trend": "holding|dropping|rising",
  "appointment": {{
    "detected": false,
    "confirmed": false,
    "type": null,
    "date": null,
    "time": null,
    "location": null,
    "address": null,
    "phone": null,
    "reason": null
  }},
  "red_flags": [],
  "suggested_next_moves": ["...", "...", "..."],
  "walk_away_recommended": false,
  "walk_away_reason": null
}}

CRITICAL RULES:
1. Return ONLY the JSON object.
2. reply: written in {target_lang}. Natural, conversational, appropriate for Wallapop chat. Not formal, not robotic. Max 3-4 sentences.
3. situation_summary: one sentence in {ui_lang_name} explaining where the negotiation stands right now.
4. strategy_used: one sentence in {ui_lang_name} explaining WHY you chose this reply approach.
5. suggested_next_moves: 3 tactical options in {ui_lang_name} for the user's NEXT message, covering different scenarios (e.g. "if they accept", "if they counter", "if they go silent").
6. walk_away_recommended: true if price shows no movement after 2+ exchanges AND price is above walk_away_price, OR if red_flags contains scam signals.
7. red_flags: specific warning strings detected in the conversation. Empty array if none.
8. price_trend: direction the price is moving in this conversation (holding/dropping/rising).
9. appointment.confirmed: true ONLY if both parties explicitly agreed to same date + time + location.
10. All reply text in {target_lang}. All analytical fields (summary, strategy, next moves) in {ui_lang_name}."""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        
        raw_content = message.content[0].text.strip()
        start_idx = raw_content.find('{')
        end_idx = raw_content.rfind('}') + 1
        
        if start_idx == -1 or end_idx <= start_idx:
            raise ValueError(f"AI failed to return a JSON object. Raw content: {raw_content[:100]}...")
            
        analysis_data = json.loads(raw_content[start_idx:end_idx])
        return jsonify(analysis_data)

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"DEBUG: Discussion generate error: {error_trace}")
        return jsonify({"error": str(e), "traceback": error_trace}), 500
