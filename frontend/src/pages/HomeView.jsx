import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search,
  Sparkles,
  MessageSquare,
  LayoutDashboard,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  ChevronRight,
  Plus,
  Navigation,
  X,
  BookOpen
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
  const [gsVisible, setGsVisible] = useState(() => localStorage.getItem('gs_hidden') !== '1')

  const hideGs = () => { setGsVisible(false); localStorage.setItem('gs_hidden', '1') }
  const showGs = () => { setGsVisible(true); localStorage.removeItem('gs_hidden') }

  const handleAppClick = (e, _app) => {
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
    { titleKey: 'home.feature_search_title', descKey: 'home.feature_search_desc', tagKey: 'home.feature_search_tag', icon: Search, path: '/search', color: 'blue' },
    { titleKey: 'home.feature_discovery_title', descKey: 'home.feature_discovery_desc', tagKey: 'home.feature_discovery_tag', icon: Sparkles, path: '/discovery', color: 'amber' },
    { titleKey: 'home.feature_negotiate_title', descKey: 'home.feature_negotiate_desc', tagKey: 'home.feature_negotiate_tag', icon: MessageSquare, path: '/negotiate', color: 'emerald' },
    { titleKey: 'home.feature_pipeline_title', descKey: 'home.feature_pipeline_desc', tagKey: 'home.feature_pipeline_tag', icon: LayoutDashboard, path: '/pipeline', color: 'purple' },
  ]

  const GS_STEPS = [
    { n: 1, emoji: '🔍', titleKey: 'home.gs_1_title', descKey: 'home.gs_1_desc', route: '/search' },
    { n: 2, emoji: '🤝', titleKey: 'home.gs_2_title', descKey: 'home.gs_2_desc', route: '/negotiate' },
    { n: 3, emoji: '📦', titleKey: 'home.gs_3_title', descKey: 'home.gs_3_desc', route: '/pipeline' },
    { n: 4, emoji: '📢', titleKey: 'home.gs_4_title', descKey: 'home.gs_4_desc', route: '/listing' },
    { n: 5, emoji: '💶', titleKey: 'home.gs_5_title', descKey: 'home.gs_5_desc', route: '/dashboard' },
  ]

  return (
    <div className="page-container max-w-6xl mx-auto px-4 md:px-6">

      {/* Getting Started */}
      {gsVisible && (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest">{t('home.gs_title')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('home.gs_subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/howto')}
              className="text-[10px] font-black text-blue-400 hover:underline uppercase tracking-widest px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-colors"
            >
              {t('home.gs_read_guide')}
            </button>
            <button
              onClick={hideGs}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-colors"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {GS_STEPS.map((step) => (
            <button
              key={step.n}
              onClick={() => navigate(step.route)}
              className="flex-shrink-0 w-48 text-left p-4 rounded-2xl bg-surface-900/50 border border-slate-700/30 hover:border-slate-500/50 hover:bg-surface-800/50 transition-all group cursor-pointer"
            >
              <div className="text-3xl font-black text-slate-800 leading-none mb-2 select-none group-hover:text-slate-700 transition-colors">
                {step.n}
              </div>
              <div className="text-2xl mb-2">{step.emoji}</div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-sm font-black text-white">{t(step.titleKey)}</span>
                <ChevronRight className="w-3 h-3 text-slate-500 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{t(step.descKey)}</p>
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Quick Stats Overlay (Moved to top) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-5 border-slate-800 bg-surface-950/30">
           <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('home.active_deals')}</div>
           <div className="text-2xl font-black text-white">{stats.activeDeals || 0}</div>
        </div>
        <div className="card p-5 border-slate-800 bg-surface-950/30">
           <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('home.total_profit')}</div>
           <div className="text-2xl font-black text-emerald-400">{stats.totalProfit || 0}€</div>
        </div>
        <div className="card p-5 border-slate-800 bg-surface-950/30">
           <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('home.avg_margin')}</div>
           <div className="text-2xl font-black text-blue-400">{stats.avgMargin || 0}%</div>
        </div>
        <div className={`card p-5 border-slate-800 bg-surface-950/30`}>
           <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('home.watching')}</div>
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
                {t('home.hero_title')} <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">{t('home.hero_title_highlight')}</span>
              </h1>
              <p className="text-lg text-slate-400 mb-8 leading-relaxed">
                {t('home.hero_subtitle')}
              </p>

              <div className="flex flex-wrap gap-4">
                <Link to="/search" className="btn-primary px-8 py-3 text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/20">
                  {t('home.start_searching')}
                </Link>
                <Link to="/pipeline" className="btn-secondary px-8 py-3 text-sm font-black uppercase tracking-widest border-slate-700">
                  {t('home.view_pipeline')}
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
                {t('home.next_events')}
              </h2>
              <Link to="/appointments" className="text-[10px] font-bold text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-500/10">
                {t('home.see_all')}
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
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{t('home.no_plans')}</p>
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
                <Plus className="w-3 h-3 inline-block mr-1 -mt-0.5" /> {t('home.book_appointment')}
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
                  {t(card.tagKey)}
                </span>
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                  {t(card.titleKey)}
                  <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {t(card.descKey)}
                </p>
              </Link>
            ))}
          </div>

        </div>

      </div>

      {/* Reopen Getting Started */}
      {!gsVisible && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={showGs}
            className="flex items-center gap-2 text-[10px] font-black text-slate-600 hover:text-slate-400 uppercase tracking-widest px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {t('home.gs_title')}
          </button>
        </div>
      )}
    </div>
  )
}
