import os
from datetime import datetime
from services.auth import get_db
from services.encryption import decrypt_key

def _track_usage(user_ref, user_data):
    """Increment usage counters for a user (works for both own-key and shared-key users)."""
    today_str = datetime.now().strftime("%Y-%m-%d")
    history = user_data.get('usageHistory') or {}
    if not isinstance(history, dict):
        history = {}
    history[today_str] = (history.get(today_str) or 0) + 1

    # Reset usageToday if it's a new day
    last_reset = user_data.get('lastUsageReset')
    usage_today = user_data.get('usageToday') or 0
    if last_reset != today_str:
        usage_today = 0

    user_ref.update({
        'usageToday': usage_today + 1,
        'totalUsage': (user_data.get('totalUsage') or 0) + 1,
        'usageHistory': history,
        'lastUsageReset': today_str
    })

def resolve_api_key(uid: str):
    """
    Decides which API key to use for a user.
    Prioritizes User-owned keys, then Shared keys if access granted.
    Always tracks usage regardless of key type.
    """
    db = get_db()
    user_ref = db.collection('users').document(uid)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        return None, "User not found in registry"
    
    user_data = user_doc.to_dict()
    
    # 1. Check for User-owned key
    encrypted_user_key = user_data.get('api_key')
    if encrypted_user_key:
        decrypted_key = decrypt_key(encrypted_user_key)
        if decrypted_key:
            _track_usage(user_ref, user_data)
            return decrypted_key, "user_key"
    
    # 2. Check for Shared access
    if user_data.get('hasSharedAccess'):
        # Check daily cap
        daily_cap = user_data.get('dailyCap') or 5
        usage_today = user_data.get('usageToday') or 0
        last_reset = user_data.get('lastUsageReset')
        
        today_str = datetime.now().strftime("%Y-%m-%d")
        
        # Reset usage if it's a new day
        if last_reset != today_str:
            usage_today = 0
            
        if usage_today < daily_cap:
            decrypted_shared = None

            # Step A: Try the explicit master shared key from config/keys
            config_doc = db.collection('config').document('keys').get()
            if config_doc.exists:
                config_data = config_doc.to_dict()
                encrypted_shared_key = config_data.get('anthropic_shared')
                if encrypted_shared_key:
                    decrypted_shared = decrypt_key(encrypted_shared_key)

            # Step B: Fallback — find any admin user's personal API key
            if not decrypted_shared:
                admin_docs = db.collection('users').where('role', '==', 'admin').stream()
                for admin_doc in admin_docs:
                    admin_data = admin_doc.to_dict()
                    admin_encrypted_key = admin_data.get('api_key')
                    if admin_encrypted_key:
                        decrypted_shared = decrypt_key(admin_encrypted_key)
                        if decrypted_shared:
                            break

            if decrypted_shared:
                _track_usage(user_ref, user_data)
                return decrypted_shared, "shared_key"

    return None, "No valid API key available or daily cap reached"
