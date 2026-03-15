import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Search, 
  Sparkles, 
  MessageSquare, 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  Clock, 
  MapPin, 
  ChevronRight,
  Plus,
  Target,
  Navigation
} from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useTranslation } from 'react-i18next'

export default function HomeView({ pipeline }) {
  const { t } = useTranslation()
  const api = useApi()
  const navigate = useNavigate()
  const clickTimeout = useRef(null)
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  const handleAppClick = (e, app) => {
    e.preventDefault()
    if (clickTimeout.current) return
    clickTimeout.current = setTimeout(() => {
      navigate('/appointments')
      clickTimeout.current = null
    }, 250)
  }

  const handleAppDoubleClick = (e, app) => {
    e.preventDefault()
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current)
      clickTimeout.current = null
    }
    navigate('/appointments', { state: { editAppointment: app } })
  }

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const data = await api.getAppointments()
        // Sort and slice to show only latest 5
        setAppointments(data.slice(0, 5))
      } catch (err) {
        console.error('Failed to load appointments', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAppointments()
  }, [])

  const stats = pipeline?.stats || { totalProfit: 0, activeDeals: 0, avgMargin: 0 }

  const FEATURE_CARDS = [
    {
      title: 'Global Search',
      desc: 'Find undervalued listings across Wallapop with AI-powered filtering.',
      icon: Search,
      path: '/search',
      color: 'blue',
      tag: 'Core'
    },
    {
      title: 'Discovery Engine',
      desc: 'Automatic lead generation based on your preferred niches and keywords.',
      icon: Sparkles,
      path: '/discovery',
      color: 'amber',
      tag: 'AI Power'
    },
    {
      title: 'Negotiation Helper',
      desc: 'AI-driven responses to close deals faster and cheaper.',
      icon: MessageSquare,
      path: '/negotiate',
      color: 'emerald',
      tag: 'Strategic'
    },
    {
      title: 'Deal Pipeline',
      desc: 'Track your inventory from acquisition to final sale.',
      icon: LayoutDashboard,
      path: '/pipeline',
      color: 'purple',
      tag: 'Management'
    }
  ]

  return (
    <div className="page-container max-w-6xl mx-auto px-4 md:px-6">
      
      {/* Quick Stats Overlay (Moved to top) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-5 border-slate-800 bg-surface-950/30">
           <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Active Deals</div>
           <div className="text-2xl font-black text-white">{stats.activeDeals || 0}</div>
        </div>
        <div className="card p-5 border-slate-800 bg-surface-950/30">
           <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Profit</div>
           <div className="text-2xl font-black text-emerald-400">{stats.totalProfit || 0}€</div>
        </div>
        <div className="card p-5 border-slate-800 bg-surface-950/30">
           <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Margin</div>
           <div className="text-2xl font-black text-blue-400">{stats.avgMargin || 0}%</div>
        </div>
        <div className={`card p-5 border-slate-800 bg-surface-950/30`}>
           <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Watching</div>
           <div className="text-2xl font-black text-amber-400">{pipeline?.deals?.filter(d => d.status === 'Watching')?.length || 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Main Content Area: Hero */}
        <div className="lg:col-span-3 space-y-8 order-1">
          {/* Hero Section */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface-800 to-surface-950 border border-slate-700/50 p-8 md:p-12">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px]" />
            <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px]" />
            
            <div className="relative z-10 max-w-xl">
              <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mb-4">
                Master the Art of <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Flipping.</span>
              </h1>
              <p className="text-lg text-slate-400 mb-8 leading-relaxed">
                FlipOps provides the ultimate AI-powered toolkit to search, analyze, and negotiate your way to profit.
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Link to="/search" className="btn-primary px-8 py-3 text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/20">
                  Start Searching
                </Link>
                <Link to="/pipeline" className="btn-secondary px-8 py-3 text-sm font-black uppercase tracking-widest border-slate-700">
                  View Pipeline
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: Next Events - Reordered to be below Hero on mobile */}
        <div className="lg:col-span-1 order-2">
          <div className="sticky top-24">
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-blue-400" />
                Next Events
              </h2>
              <Link to="/appointments" className="text-[10px] font-bold text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-500/10">
                See All
              </Link>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="flex py-12 items-center justify-center">
                  <span className="spinner w-6 h-6 border-2 border-slate-700 border-t-blue-500" />
                </div>
              ) : appointments.length === 0 ? (
                <div className="card p-6 text-center bg-surface-900/30 border-slate-800/50">
                  <CalendarIcon className="w-8 h-8 text-slate-800 mx-auto mb-2 opacity-50" />
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">No plans yet</p>
                </div>
              ) : (
                appointments.map(app => {
                  const date = new Date(app.start)
                  return (
                    <div 
                      key={app.id} 
                      onClick={(e) => handleAppClick(e, app)}
                      onDoubleClick={(e) => handleAppDoubleClick(e, app)}
                      className="card p-4 bg-surface-900/40 border-slate-800 hover:border-slate-700 transition-all group cursor-pointer"
                    >
                      <div className="flex gap-3">
                        <div className="shrink-0 w-10 h-10 rounded-xl bg-surface-800 flex flex-col items-center justify-center border border-slate-700/50 group-hover:border-blue-500/30 transition-colors">
                          <span className="text-[10px] font-black text-blue-400 uppercase leading-none">
                            {date.toLocaleDateString(undefined, { month: 'short' })}
                          </span>
                          <span className="text-sm font-black text-white leading-none mt-0.5">
                            {date.getDate()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-slate-200 break-words group-hover:text-white transition-colors">
                            {app.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="flex items-center gap-1 text-[10px] text-slate-500 font-bold">
                              <Clock className="w-3 h-3" /> {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {app.location && (
                              <div className="flex items-start justify-between gap-2 mt-1.5 pt-1.5 border-t border-slate-800/50">
                                <span className="flex items-start gap-1 text-[10px] text-slate-500 font-bold break-words whitespace-normal leading-tight">
                                  <MapPin className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" /> {app.location}
                                </span>
                                <a 
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(app.location)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 p-1 text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors"
                                  title="Get Directions"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Navigation className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              
              <Link 
                to="/appointments" 
                className="block w-full text-center py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-all text-[10px] font-black uppercase tracking-widest"
              >
                <Plus className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Book Appointment
              </Link>
            </div>
          </div>
        </div>

        {/* Features and Stats: Below Hero on desktop, after Appointments on mobile */}
        <div className="lg:col-span-3 space-y-8 order-3">
          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURE_CARDS.map((card) => (
              <Link 
                key={card.path} 
                to={card.path}
                className="group relative block p-6 rounded-2xl bg-surface-900/50 border border-slate-700/30 hover:border-slate-500/50 transition-all hover:bg-surface-800/50"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${
                  card.color === 'blue' ? 'bg-blue-500/10 text-blue-400' :
                  card.color === 'amber' ? 'bg-amber-500/10 text-amber-400' :
                  card.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                  'bg-purple-500/10 text-purple-400'
                }`}>
                  <card.icon className="w-6 h-6" />
                </div>
                
                <span className="inline-block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  {card.tag}
                </span>
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                  {card.title}
                  <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {card.desc}
                </p>
              </Link>
            ))}
          </div>

        </div>

      </div>
    </div>
  )
}
