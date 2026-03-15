from flask import Blueprint, request, jsonify
from services.auth import require_admin, get_db
from services.encryption import encrypt_key

admin_bp = Blueprint('admin', __name__)

@admin_bp.route("/api/admin/set-key", methods=["POST"])
@require_admin
def set_shared_key():
    db = get_db()
    data = request.json
    api_key = data.get('api_key')
    
    if not api_key:
        return jsonify({"error": "API key required"}), 400
        
    encrypted = encrypt_key(api_key)
    db.collection('config').document('keys').set({
        'anthropic_shared': encrypted
    }, merge=True)
    
    return jsonify({"message": "Shared API key updated successfully"})

@admin_bp.route("/api/admin/users", methods=["GET"])
@require_admin
def get_all_users():
    db = get_db()
    users_ref = db.collection('users')
    docs = users_ref.stream()
    
    users = []
    for doc in docs:
        u = doc.to_dict()
        # Remove sensitive data
        if 'api_key' in u: 
            u['hasOwnKey'] = True
            del u['api_key']
        users.append(u)
        
    return jsonify(users)

@admin_bp.route("/api/admin/users/<uid>", methods=["PATCH"])
@require_admin
def update_user_status(uid):
    db = get_db()
    data = request.json
    
    update_data = {}
    if 'hasSharedAccess' in data:
        update_data['hasSharedAccess'] = data['hasSharedAccess']
    if 'dailyCap' in data:
        update_data['dailyCap'] = int(data['dailyCap'])
    if 'role' in data:
        update_data['role'] = data['role']
        
    if not update_data:
        return jsonify({"error": "No update data provided"}), 400
        
    db.collection('users').document(uid).update(update_data)
    return jsonify({"message": "User updated successfully"})

@admin_bp.route("/api/admin/stats", methods=["GET"])
@require_admin
def get_system_stats():
    db = get_db()
    from datetime import datetime
    today_str = datetime.now().strftime("%Y-%m-%d")

    users_ref = db.collection('users')
    docs = users_ref.stream()

    total_users = 0
    total_usage = 0
    users_with_shared = 0
    users_with_own_key = 0
    total_calls_today = 0
    usage_list = []
    all_histories = []
    most_active = None
    most_active_count = 0

    for doc in docs:
        u = doc.to_dict()
        total_users += 1
        user_total = u.get('totalUsage', 0)
        total_usage += user_total
        if u.get('hasSharedAccess'):
            users_with_shared += 1
        if u.get('api_key'):
            users_with_own_key += 1
        history = u.get('usageHistory') or {}
        if isinstance(history, dict):
            all_histories.append(history)
            today_count = history.get(today_str, 0)
        else:
            today_count = 0
        total_calls_today += today_count
        usage_list.append(user_total)
        if user_total > most_active_count:
            most_active_count = user_total
            most_active = u.get('displayName') or u.get('email') or 'Unknown'

    avg_usage = round(total_usage / total_users, 1) if total_users else 0

    # Build aggregated usage history across all users (last 30 days)
    from collections import defaultdict
    agg_history = defaultdict(int)
    for h in all_histories:
        for date_str, count in h.items():
            agg_history[date_str] += count
    # Sort and keep last 30 days
    sorted_history = dict(sorted(agg_history.items())[-30:])

    return jsonify({
        "totalUsers": total_users,
        "totalUsage": total_usage,
        "activeSharedUsers": users_with_shared,
        "ownKeyUsers": users_with_own_key,
        "callsToday": total_calls_today,
        "avgUsagePerUser": avg_usage,
        "mostActiveUser": most_active,
        "mostActiveUserCalls": most_active_count,
        "aggregatedHistory": sorted_history,
    })
