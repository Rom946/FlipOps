from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
import datetime

class CalendarService:
    def __init__(self, access_token=None):
        self.creds = None
        if access_token:
            self.creds = Credentials(token=access_token)
    
    def get_service(self):
        if not self.creds:
            return None
        return build('calendar', 'v3', credentials=self.creds)

    def create_event(self, appointment_data):
        service = self.get_service()
        if not service:
            return None
            
        event = {
            'summary': appointment_data.get('title'),
            'location': appointment_data.get('location'),
            'description': appointment_data.get('description'),
            'start': {
                'dateTime': appointment_data.get('start'),
                'timeZone': 'UTC',
            },
            'end': {
                'dateTime': appointment_data.get('end'),
                'timeZone': 'UTC',
            },
            'reminders': {
                'useDefault': True,
            },
        }

        event = service.events().insert(calendarId='primary', body=event).execute()
        return event.get('id')

    def delete_event(self, event_id):
        service = self.get_service()
        if not service or not event_id:
            return False
        
        try:
            service.events().delete(calendarId='primary', eventId=event_id).execute()
            return True
        except Exception:
            return False

    def update_event(self, event_id, appointment_data):
        service = self.get_service()
        if not service or not event_id:
            return None

        # Fetch existing event first
        try:
            event = service.events().get(calendarId='primary', eventId=event_id).execute()
            
            # Update fields
            if 'title' in appointment_data: event['summary'] = appointment_data['title']
            if 'location' in appointment_data: event['location'] = appointment_data['location']
            if 'description' in appointment_data: event['description'] = appointment_data['description']
            if 'start' in appointment_data: event['start']['dateTime'] = appointment_data['start']
            if 'end' in appointment_data: event['end']['dateTime'] = appointment_data['end']

            updated_event = service.events().update(calendarId='primary', eventId=event_id, body=event).execute()
            return updated_event
        except Exception:
            return None
