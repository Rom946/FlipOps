import os
from flask import Blueprint, request, jsonify
from services.auth import require_auth, get_db
from services.encryption import encrypt_key, decrypt_key

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
