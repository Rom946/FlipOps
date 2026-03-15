from flask import Blueprint, request, jsonify
from services.auth import require_auth, get_db
from services.calendar_service import CalendarService
import datetime

appointments_bp = Blueprint('appointments', __name__)

@appointments_bp.route('/api/appointments', methods=['GET'])
@require_auth
def get_appointments():
    try:
        uid = request.user['uid']
        db = get_db()
        docs = db.collection('users').document(uid).collection('appointments').stream()
        appointments = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            appointments.append(data)
        appointments.sort(key=lambda x: x.get('start', ''), reverse=True)
        return jsonify(appointments)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@appointments_bp.route('/api/appointments', methods=['POST'])
@require_auth
def create_appointment():
    try:
        uid = request.user['uid']
        db = get_db()
        data = request.json
        google_token = request.headers.get('X-Google-Token')
        
        if not data.get('title') or not data.get('start'):
            return jsonify({"error": "Title and start time are required"}), 400
        
        new_appointment = {
            "title": data['title'],
            "start": data['start'],
            "end": data.get('end'),
            "location": data.get('location', ''),
            "phone": data.get('phone', ''),
            "description": data.get('description', ''),
            "deal_id": data.get('deal_id', ''),
            "deal_title": data.get('deal_title', ''),
            "type": data.get('type', 'inspection'),
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        # Sync with Google Calendar if token provided
        if google_token:
            try:
                cal = CalendarService(google_token)
                event_id = cal.create_event(new_appointment)
                if event_id:
                    new_appointment['google_event_id'] = event_id
            except Exception as e:
                print(f"Calendar Sync Error: {e}")

        appointment_ref = db.collection('users').document(uid).collection('appointments').document()
        appointment_ref.set(new_appointment)
        new_appointment['id'] = appointment_ref.id
        
        return jsonify(new_appointment), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@appointments_bp.route('/api/appointments/<appointment_id>', methods=['DELETE'])
@require_auth
def delete_appointment(appointment_id):
    try:
        uid = request.user['uid']
        db = get_db()
        google_token = request.headers.get('X-Google-Token')
        doc_ref = db.collection('users').document(uid).collection('appointments').document(appointment_id)
        doc = doc_ref.get()
        
        if doc.exists and google_token:
            data = doc.to_dict()
            if data.get('google_event_id'):
                try:
                    cal = CalendarService(google_token)
                    cal.delete_event(data['google_event_id'])
                except Exception as e:
                    print(f"Calendar Delete Error: {e}")

        doc_ref.delete()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@appointments_bp.route('/api/appointments/<appointment_id>', methods=['PATCH'])
@require_auth
def update_appointment(appointment_id):
    try:
        uid = request.user['uid']
        db = get_db()
        data = request.json
        appointment_ref = db.collection('users').document(uid).collection('appointments').document(appointment_id)
        
        # Merge with existing data
        appointment_ref.update(data)
        
        updated_doc = appointment_ref.get()
        result = updated_doc.to_dict()
        result['id'] = updated_doc.id
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
