import { useState, useEffect } from 'react'
import { Calendar, Clock, MapPin, AlignLeft, X, Sparkles, AlertCircle, CheckCircle } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'

export default function AppointmentModal({ isOpen, onClose, dealId, dealTitle, onCreated, appointment }) {
  const api = useApi()
  const { googleAccessToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
  const [form, setForm] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    time: '12:00',
    duration: '30',
    location: '',
    phone: '',
    description: '',
    type: 'inspection',
    syncCalendar: !!googleAccessToken
  })

  useEffect(() => {
    setSuccess(false)
    setError(null)
    
    if (appointment) {
      const startDate = new Date(appointment.start)
      setForm({
        title: appointment.title,
        date: startDate.toISOString().split('T')[0],
        time: startDate.toTimeString().slice(0, 5),
        duration: appointment.end ? Math.round((new Date(appointment.end) - startDate) / 60000).toString() : '30',
        location: appointment.location || '',
        phone: appointment.phone || '',
        description: appointment.description || '',
        type: appointment.type || 'inspection',
        syncCalendar: false // Don't auto-resync existing
      })
    } else {
      setForm({
        title: dealTitle ? `Inspection: ${dealTitle}` : '',
        date: new Date().toISOString().split('T')[0],
        time: '12:00',
        duration: '30',
        location: '',
        phone: '',
        description: '',
        type: 'inspection',
        syncCalendar: !!googleAccessToken
      })
    }
  }, [appointment, dealTitle, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const startDateTime = new Date(`${form.date}T${form.time}:00`)
      const endDateTime = new Date(startDateTime.getTime() + parseInt(form.duration) * 60000)
      
      const payload = {
        title: form.title,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        location: form.location,
        phone: form.phone,
        description: form.description,
        type: form.type,
        deal_id: dealId,
        deal_title: dealTitle
      }

      const headers = {}
      if (form.syncCalendar && googleAccessToken) {
        headers['X-Google-Token'] = googleAccessToken
      }

      let result
      if (appointment?.id) {
        result = await api.updateAppointment(appointment.id, payload)
      } else {
        result = await api.createAppointment(payload, headers)
      }
      
      setSuccess(true)
      setTimeout(() => {
        onCreated && onCreated(result)
        onClose()
      }, 1500)
    } catch (err) {
      setError(err.message || `Failed to ${appointment ? 'update' : 'create'} appointment`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
      <div className="card w-full max-w-md p-6 shadow-2xl border-blue-500/30 ring-1 ring-blue-500/20 animate-fade-in-up">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-400" />
            {appointment ? 'Edit Event' : 'Schedule Event'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {success ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 italic">
              {appointment ? 'Changes Saved!' : 'Appointment Scheduled!'}
            </h3>
            <p className="text-slate-400 text-sm">
              {form.syncCalendar ? 'Syncing with Google Calendar...' : 'Updated in database'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Event Title</label>
              <input 
                className="input" 
                value={form.title} 
                onChange={e => setForm({...form, title: e.target.value})}
                placeholder="Inspection, Meeting, Handover..."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="date"
                    className="input pl-10"
                    value={form.date}
                    onChange={e => setForm({...form, date: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label">Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="time"
                    className="input pl-10"
                    value={form.time}
                    onChange={e => setForm({...form, time: e.target.value})}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Duration (min)</label>
                <select 
                  className="input"
                  value={form.duration}
                  onChange={e => setForm({...form, duration: e.target.value})}
                >
                  <option value="15">15 mins</option>
                  <option value="30">30 mins</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select 
                  className="input"
                  value={form.type}
                  onChange={e => setForm({...form, type: e.target.value})}
                >
                  <option value="inspection">🔍 Inspection</option>
                  <option value="handover">🤝 Handover</option>
                  <option value="meeting">👥 Meeting</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Meeting Point / Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  className="input pl-10" 
                  value={form.location}
                  onChange={e => setForm({...form, location: e.target.value})}
                  placeholder="Street address, city, subway station..."
                />
              </div>
            </div>

            <div>
              <label className="label">Contact Phone</label>
              <input 
                className="input" 
                value={form.phone}
                onChange={e => setForm({...form, phone: e.target.value})}
                placeholder="+34 600 000 000"
              />
            </div>

            <div>
              <label className="label">Remarks / Checklist</label>
              <textarea 
                className="input min-h-[80px] py-2" 
                value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Check screen, battery health, iCloud status..."
              />
            </div>

            {googleAccessToken && (
              <label className="flex items-center gap-3 p-3 bg-blue-500/5 hover:bg-blue-500/10 rounded-lg border border-blue-500/20 cursor-pointer transition-colors group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/40"
                  checked={form.syncCalendar}
                  onChange={e => setForm({...form, syncCalendar: e.target.checked})}
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-blue-400 group-hover:text-blue-300">Sync with Google Calendar</div>
                  <div className="text-[10px] text-slate-500">Automatically create event in your primary calendar</div>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              </label>
            )}

            <button 
              type="submit" 
              className="btn-primary w-full justify-center py-3 text-base shadow-xl shadow-blue-500/10 mt-2" 
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : <Sparkles className="w-4 h-4" />}
              {loading ? (appointment ? 'Saving...' : 'Scheduling...') : (appointment ? 'Update Appointment' : 'Confirm Appointment')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
