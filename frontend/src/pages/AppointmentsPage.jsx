import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Calendar as CalendarIcon, Clock, MapPin, Trash2, ExternalLink, Filter, Plus, ChevronRight, Search, MessageCircle, Tag, Target, Navigation, Pencil } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import AppointmentModal from '../components/AppointmentModal'

const TYPE_COLORS = {
  inspection: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
  handover: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
  meeting: 'border-purple-500/30 bg-purple-500/5 text-purple-400',
}

const TYPE_LABELS = {
  inspection: '🔍 Inspection',
  handover: '🤝 Handover',
  meeting: '👥 Meeting',
}

export default function AppointmentsPage() {
  const api = useApi()
  const location = useLocation()
  const { googleAccessToken } = useAuth()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchAppointments()
  }, [])

  useEffect(() => {
    if (location.state?.editAppointment) {
      setEditingAppointment(location.state.editAppointment)
      setIsModalOpen(true)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      const data = await api.getAppointments()
      setAppointments(data)
    } catch (err) {
      setError('Failed to load appointments')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this appointment? This will also remove it from Google Calendar if synced.')) return
    
    try {
      const headers = {}
      if (googleAccessToken) headers['X-Google-Token'] = googleAccessToken
      
      await api.deleteAppointment(id, headers)
      setAppointments(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      alert('Failed to delete appointment')
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><span className="spinner w-8 h-8" /></div>

  const filtered = appointments.filter(a => {
    const matchesFilter = filter === 'all' || a.type === filter
    const matchesSearch = a.title?.toLowerCase().includes(search.toLowerCase()) || 
                          a.deal_title?.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="page-container max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="section-header mb-0">
          <CalendarIcon className="w-6 h-6 text-blue-400" />
          <span>Appointments</span>
          <span className="text-sm font-normal text-slate-500 ml-2">({filtered.length})</span>
        </h1>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary w-full md:w-auto justify-center">
          <Plus className="w-4 h-4" /> New Event
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input 
            className="input pl-10 py-2"
            placeholder="Search events or deals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'inspection', 'handover', 'meeting'].map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                filter === t ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-surface-800 border-slate-700 text-slate-500 hover:border-slate-600'
              }`}
            >
              {t === 'all' ? 'All' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
           <CalendarIcon className="w-12 h-12 text-slate-700 mx-auto mb-4" />
           <p className="text-slate-400 font-medium">No appointments found</p>
           <p className="text-xs text-slate-600 mt-1">Schedule your first inspection or meeting to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(app => {
            const startDate = new Date(app.start)
            return (
              <div 
                key={app.id} 
                onDoubleClick={() => { setEditingAppointment(app); setIsModalOpen(true); }}
                className={`card p-5 border-l-4 transition-all hover:bg-slate-800/20 group cursor-pointer ${(TYPE_COLORS[app.type] || TYPE_COLORS['meeting']).split(' ')[0]}`}
              >
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Date/Time Block */}
                  <div className="md:w-32 flex md:flex-col items-center md:items-start gap-2 md:gap-0">
                    <div className="text-sm font-black text-slate-100 uppercase">
                      {startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-xs text-slate-500 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Content Block */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${TYPE_COLORS[app.type] || TYPE_COLORS['meeting']}`}>
                        {app.type || 'meeting'}
                      </span>
                      {app.google_event_id && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Synced
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-100 mb-1">{app.title}</h3>
                    {app.deal_title && (
                      <div className="flex items-center gap-1 text-xs text-blue-400 font-medium mb-2">
                        <ChevronRight className="w-3 h-3" /> Deal: {app.deal_title}
                      </div>
                    )}
                    {app.location && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-sm text-slate-400 truncate">{app.location}</span>
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(app.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 p-1 text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors"
                          title="Get Directions"
                        >
                          <Navigation className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Actions Block */}
                  <div className="flex md:flex-col justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {app.deal_id && (
                      <Link 
                        to={`/pipeline?search=${app.deal_id}`}
                        className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                        title="View Deal"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    )}
                    <button 
                      onClick={() => { setEditingAppointment(app); setIsModalOpen(true); }}
                      className="p-2 text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all"
                      title="Edit Event"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(app.id)}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                      title="Delete Event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AppointmentModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingAppointment(null); }} 
        onCreated={fetchAppointments}
        appointment={editingAppointment}
      />
    </div>
  )
}
