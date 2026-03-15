import os
import json
import anthropic
import httpx
from flask import Blueprint, request, jsonify
from services.auth import require_auth
from services.key_resolver import resolve_api_key

pipeline_bp = Blueprint("pipeline", __name__)


@pipeline_bp.route("/api/score-deals", methods=["POST"])
@require_auth
def score_deals():
    try:
        uid = request.user['uid']
        api_key, key_type = resolve_api_key(uid)
        
        if not api_key:
            return jsonify({"error": f"API Key Error: {key_type}"}), 403

        # Use an explicit http_client to avoid internal 'proxies' argument error in httpx 0.28+
        client = anthropic.Anthropic(api_key=api_key, http_client=httpx.Client())
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON body provided"}), 400

        results = data.get("results", [])
        if not results:
            return jsonify({"error": "No results to score"}), 400

        # Limit to avoid huge prompts
        results = results[:20]

        items_text = "\n".join([
            f"{i+1}. {item.get('title', 'Unknown')} — {item.get('price', 0)}€ — {item.get('location', '')} — Vendedor: {item.get('seller', '')}"
            for i, item in enumerate(results)
        ])

        prompt = f"""Analiza estas {len(results)} listings de Wallapop y puntúa cada una como oportunidad de flipping (comprar barato y revender con margen).

Listings:
{items_text}

Para CADA listing devuelve un JSON con:
- index: número del 1 al {len(results)}
- deal_score: "deal" | "fair" | "pass"
- margin_estimate: margen estimado de reventa en % (número entero)
- negotiation_angle: frase corta en español (máx 10 palabras) sobre cómo negociar

Devuelve ÚNICAMENTE un array JSON válido sin texto adicional:
[
  {{"index": 1, "deal_score": "deal", "margin_estimate": 40, "negotiation_angle": "Precio algo alto, ofrecer 20% menos"}},
  ...
]

Considera como "deal" si el margen esperado es >25%, "fair" si es 10-25%, "pass" si <10% o precio excesivo."""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        scores = json.loads(raw)

        # Merge scores back into results
        score_map = {item["index"]: item for item in scores}
        annotated = []
        for i, item in enumerate(results):
            score_data = score_map.get(i + 1, {})
            annotated.append({
                **item,
                "deal_score": score_data.get("deal_score", "fair"),
                "margin_estimate": score_data.get("margin_estimate", 0),
                "negotiation_angle": score_data.get("negotiation_angle", ""),
            })

        return jsonify({"results": annotated})

    except json.JSONDecodeError as e:
        return jsonify({"error": f"Failed to parse AI response: {str(e)}"}), 502
    except ValueError as e:
        return jsonify({"error": str(e)}), 500
    except anthropic.APIError as e:
        err_msg = str(e).lower()
        if "credit balance is too low" in err_msg or "insufficient_funds" in err_msg:
            return jsonify({"error": "AI Error: Your Anthropic credits are exhausted. Please add credits to your account to continue."}), 402
        return jsonify({"error": f"Anthropic API error: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500
