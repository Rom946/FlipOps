import os
import firebase_admin
from firebase_admin import auth, credentials, firestore
from functools import wraps
from flask import request, jsonify
from dotenv import load_dotenv

load_dotenv()

# Firebase Admin Initialization
service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
project_id = os.getenv("FIREBASE_PROJECT_ID")

if not firebase_admin._apps:
    print(f"DEBUG: Initializing Firebase Admin...")
    print(f"DEBUG: Service Account Path: {service_account_path}")
    
    initialized = False
    if service_account_path:
        # Resolve path relative to THIS file's directory (backend/services)
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # points to backend/
        possible_paths = [
            os.path.abspath(service_account_path),
            os.path.join(base_dir, service_account_path),
            os.path.join(os.getcwd(), service_account_path),
            os.path.join(os.getcwd(), 'backend', service_account_path)
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                try:
                    print(f"DEBUG: Using service account at: {path}")
                    cred = credentials.Certificate(path)
                    firebase_admin.initialize_app(cred)
                    initialized = True
                    print("DEBUG: Firebase initialized with Certificate")
                    break
                except Exception as e:
                    print(f"DEBUG: Certificate initialization failed at {path}: {e}")
        
        if not initialized:
            print(f"DEBUG: Service account file NOT FOUND in search paths: {possible_paths}")

    if not initialized:
        # Fallback for development (requires GOOGLE_APPLICATION_CREDENTIALS or explicit project id)
        try:
            options = {'projectId': project_id} if project_id else {}
            firebase_admin.initialize_app(options=options)
            print(f"DEBUG: Firebase initialized with ADC (Project ID: {project_id})")
        except Exception as e:
            print(f"DEBUG: Firebase ADC fallback failed: {e}")

def get_db():
    """Lazy database initialization to prevent startup crashes when credentials are missing."""
    if not firebase_admin._apps:
        raise RuntimeError(
            "Firebase Admin SDK not initialized. "
            "Please set FIREBASE_SERVICE_ACCOUNT_PATH in your .env file."
        )
    return firestore.client()

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get("Authorization")
        if not id_token or not id_token.startswith("Bearer "):
            return jsonify({"error": "Unauthorized, missing token"}), 401
        
        id_token = id_token.split("Bearer ")[1]
        try:
            decoded_token = auth.verify_id_token(id_token)
            request.user = decoded_token  # Set user in request context
        except Exception as e:
            return jsonify({"error": f"Invalid token: {str(e)}"}), 401
        
        return f(*args, **kwargs)
    return decorated_function

def require_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # reuse auth logic or assume it was called before
        id_token = request.headers.get("Authorization")
        if not id_token or not id_token.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401
        
        id_token = id_token.split("Bearer ")[1]
        try:
            decoded_token = auth.verify_id_token(id_token)
            uid = decoded_token['uid']
            
            # Check for admin role in Firestore or via VITE_ADMIN_UID env
            admin_uid = os.getenv("ADMIN_UID")
            if uid == admin_uid:
                request.user = decoded_token
                return f(*args, **kwargs)
            
            # Or check Firestore
            db = get_db()
            user_doc = db.collection('users').document(uid).get()
            if user_doc.exists and user_doc.to_dict().get('role') == 'admin':
                request.user = decoded_token
                return f(*args, **kwargs)
                
            return jsonify({"error": "Forbidden, admin access required"}), 403
            
        except Exception as e:
            return jsonify({"error": f"Invalid token: {str(e)}"}), 401
            
    return decorated_function
