import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Search, MessageSquare, Tag, Layers, BarChart2, Zap, BookOpen, User, LogOut, Settings, Shield, Home, Calendar
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'home' },
  { to: '/search', icon: Search, label: 'search' },
  { to: '/discovery', icon: Zap, label: 'discovery' },
  { to: '/negotiate', icon: MessageSquare, label: 'negotiate' },
  { to: '/listing', icon: Tag, label: 'listing' },
  { to: '/pipeline', icon: Layers, label: 'pipeline' },
  { to: '/appointments', icon: Calendar, label: 'appointments' },
  { to: '/dashboard', icon: BarChart2, label: 'dashboard' },
  { to: '/howto', icon: BookOpen, label: 'howto' },
];

export default function Layout({ children }) {
  const { t, i18n } = useTranslation()
  const { user, logout, isAdmin } = useAuth()
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-surface-900/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center transition-transform group-hover:rotate-6">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold tracking-tight text-slate-100">
                Flip<span className="text-blue-400">Ops</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-start gap-1 px-2 py-2 rounded-xl transition-all duration-150 min-w-[5rem] h-16 ${
                      isActive
                        ? 'bg-brand-600/20 text-blue-400 border border-brand-500/30 shadow-lg shadow-blue-500/5'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`
                  }
                >
                  <div className="h-6 flex items-center justify-center">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight whitespace-nowrap">
                    {t(`nav.${label}`)}
                  </span>
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-1 bg-slate-800/50 rounded-full px-1 py-0.5 border border-slate-700/50 mx-2">
              {['en', 'es', 'ca'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => i18n.changeLanguage(lang)}
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full transition-all ${
                    i18n.language === lang 
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-slate-700/50 hidden md:block mx-1" />

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-700/50 transition-colors"
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full border border-slate-700" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                )}
              </button>

              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-20 animate-fade-in-up origin-top-right">
                    <div className="px-4 py-2 border-b border-slate-800 mb-1">
                      <p className="text-xs font-bold text-slate-100 truncate">{user?.displayName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
                    </div>
                    
                    <Link 
                      to="/management" 
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
                    >
                      {isAdmin ? <Shield className="w-4 h-4 text-emerald-400" /> : <Settings className="w-4 h-4 text-blue-400" />}
                      Management
                    </Link>
                    
                    <button 
                      onClick={() => { logout(); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-900/95 backdrop-blur-md border-t border-slate-700/50 flex">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-start py-2.5 transition-colors h-14 ${
                isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            <div className="h-6 flex items-center justify-center mb-0.5">
              <Icon className="w-5 h-5 flex-shrink-0" />
            </div>
            <span className="text-[7.5px] font-black uppercase tracking-tight leading-none text-center px-0.5 max-w-full overflow-hidden break-words">
              {t(`nav.${label}`)}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 pb-20 sm:pb-0">
        {children}
      </main>
    </div>
  )
}
