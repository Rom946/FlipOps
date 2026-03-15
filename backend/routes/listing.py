import os
import json
import anthropic
import httpx
import traceback
from flask import Blueprint, request, jsonify
from services.auth import require_auth, get_db
from services.key_resolver import resolve_api_key

listing_bp = Blueprint("listing", __name__)


@listing_bp.route("/api/generate-listing", methods=["POST"])
@require_auth
def generate_listing():
    try:
        uid = request.user['uid']
        api_key, key_type = resolve_api_key(uid)

        if not api_key:
            return jsonify({"error": f"API Key Error: {key_type}"}), 403

        client = anthropic.Anthropic(api_key=api_key, http_client=httpx.Client())

        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON body provided"}), 400

        product = data.get("product", "")
        bought_price = float(data.get("bought_price", 0))
        target_margin = float(data.get("target_margin", 35))
        condition = data.get("condition", "Good")
        tone = data.get("tone", "persuasive").lower()

        if not product:
            return jsonify({"error": "Product name is required"}), 400

        # Tone instructions
        tone_configs = {
            "professional": {
                "desc": "clear, factual, and direct tone. Focus on specifications and condition.",
                "style": "Expert and trustworthy"
            },
            "persuasive": {
                "desc": "engaging, benefit-driven, and compelling tone. Use emotional hooks to encourage the sale.",
                "style": "Sales-oriented and catchy"
            },
            "friendly": {
                "desc": "casual, warm, and approachable tone. Use a personal touch as if recommending to a friend.",
                "style": "Approachable and kind"
            }
        }
        
        selected_tone = tone_configs.get(tone, tone_configs["persuasive"])

        # Fetch user language preference for message generation
        db = get_db()
        user_doc = db.collection('users').document(uid).get()
        negotiation_language = 'es'
        if user_doc.exists:
            negotiation_language = user_doc.to_dict().get('negotiation_language', 'es')

        # Calculate target sell price
        target_sell = round(bought_price * (1 + target_margin / 100), 2)
        profit = round(target_sell - bought_price, 2)

        language_config = {
            'en': {
                'condition_map': {
                    "New": "New (unused, in original box)",
                    "Like new": "Like new (barely used, perfect condition)",
                    "Good": "Good condition (some normal signs of use)",
                    "Fair": "Fair (visible use but works perfectly)",
                },
                'prompt_lang': 'English',
                'instruction': 'Write the listing in natural British/American English.',
            },
            'es': {
                'condition_map': {
                    "New": "Nuevo (sin usar, en caja original)",
                    "Like new": "Como nuevo (usado muy poco, en perfecto estado)",
                    "Good": "Buen estado (algunos signos de uso normales)",
                    "Fair": "Aceptable (uso visible pero funciona perfectamente)",
                },
                'prompt_lang': 'Spanish',
                'instruction': 'Escribe el anuncio en español de España, natural y cercano.',
            },
            'ca': {
                'condition_map': {
                    "New": "Nou (sense usar, en caixa original)",
                    "Like new": "Com nou (poc usat, en perfecte estat)",
                    "Good": "Bon estat (alguns signes d'ús normals)",
                    "Fair": "Acceptable (ús visible però funciona perfectament)",
                },
                'prompt_lang': 'Catalan',
                'instruction': "Escriu l'anunci en català, natural i proper.",
            },
        }

        lang = language_config.get(negotiation_language, language_config['es'])
        condition_desc = lang['condition_map'].get(condition, condition)

        # Fetch custom listing prompt from user settings
        custom_listing_instr = user_doc.to_dict().get('custom_listing_prompt', '').strip() if user_doc.exists else ''
        custom_instructions_block = f"\nADDITIONAL INSTRUCTIONS FROM USER: {custom_listing_instr}\n" if custom_listing_instr else ""

        prompt = f"""You are an expert Wallapop seller in Spain. Generate a {selected_tone['style']} product listing in {lang['prompt_lang']} that maximizes views and conversion.{custom_instructions_block}

Use tone: {selected_tone['desc']}
{lang['instruction']}

Product: {product}
Condition: {condition_desc}
Bought at: {bought_price}€
Target sell price: {target_sell}€
Target margin: {target_margin}%

Return ONLY valid JSON with this exact structure. No extra text, no markdown, no code fences.

{{
  "title": "...",
  "price": {target_sell},
  "description": "...",
  "tags": ["...", "...", "...", "...", "..."],
  "pricing_analysis": {{
    "suggested_price": 0,
    "min_acceptable": 0,
    "price_reasoning": "..."
  }},
  "seo": {{
    "search_keywords": ["...", "...", "..."],
    "best_category": "..."
  }},
  "selling_tips": ["...", "...", "..."]
}}

CRITICAL RULES:
1. Return ONLY the JSON object. No extra text whatsoever.
2. title: max 50 characters, no emojis, no ALL CAPS, natural language. Include brand + model + key spec. Example: "iPhone 13 Pro 256GB Azul — Impecable"
3. description: 4-6 lines, natural and compelling. Structure: Line 1: hook sentence highlighting best feature. Lines 2-3: key specs and condition details. Line 4: what is included (charger, box, etc.) — infer from product if not specified. Line 5: brief reason for selling (sounds natural, builds trust). Line 6: call to action (open to reasonable offers, fast response, etc.)
4. tags: exactly 5 lowercase keywords a buyer would search for. Mix brand, model, category, condition.
5. suggested_price: optimal price based on condition and typical Wallapop market for this product. If {target_sell} is significantly above market, suggest a more competitive price and explain why.
6. min_acceptable: lowest price to accept to still hit {target_margin}% margin after Wallapop 10% fee. Formula: min_acceptable = {bought_price} * (1 + {target_margin}/100) / 0.90
7. price_reasoning: 1-2 sentences explaining the pricing strategy.
8. search_keywords: 3 additional keywords beyond tags that improve discoverability in Wallapop search.
9. best_category: the most appropriate Wallapop category for this product in Spanish.
10. selling_tips: 3 practical tips specific to this product to sell faster on Wallapop. Examples: best time to post, which photos to take, common buyer questions to pre-answer in description.
11. All descriptive text in {lang['prompt_lang']}.
12. Tone must be {selected_tone['desc']} throughout — not generic copy-paste listing language."""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
 
        # Parse the JSON response more robustly
        try:
            start_idx = raw.find('{')
            end_idx = raw.rfind('}') + 1
            if start_idx == -1 or end_idx == 0:
                raise ValueError("No JSON found in response")
            listing = json.loads(raw[start_idx:end_idx])
        except Exception as e:
            traceback.print_exc()
            return jsonify({
                "error": "AI failed to return valid JSON",
                "details": str(e),
                "raw": raw,
                "traceback": traceback.format_exc()
            }), 502
 
        return jsonify({
            "title": listing.get("title", ""),
            "price": listing.get("price", target_sell),
            "description": listing.get("description", ""),
            "tags": listing.get("tags", []),
            "pricing_analysis": listing.get("pricing_analysis", {}),
            "seo": listing.get("seo", {}),
            "selling_tips": listing.get("selling_tips", []),
            "bought_price": bought_price,
            "target_sell": target_sell,
            "profit": profit,
            "margin_pct": target_margin,
        })

    except json.JSONDecodeError as e:
        return jsonify({"error": f"Failed to parse AI response as JSON: {str(e)}", "raw": raw}), 502
    except ValueError as e:
        return jsonify({"error": str(e)}), 500
    except anthropic.APIError as e:
        err_msg = str(e).lower()
        if "credit balance is too low" in err_msg or "insufficient_funds" in err_msg:
            return jsonify({"error": "AI Error: Your Anthropic credits are exhausted. Please add credits to your account to continue."}), 402
        return jsonify({"error": f"Anthropic API error: {str(e)}"}), 502
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Server error: {str(e)}", "traceback": traceback.format_exc()}), 500
