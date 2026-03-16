/**
 * @flipops-map AdminDashboard.jsx
 *
 * IMPORTS: L80–L114
 * CONSTANTS:
 *   DEFAULT_PLATFORM_PREFS  L116
 *   PLATFORMS               L117–L122
 *   PROVIDER_INFO           L124–L139
 *   DEFAULT_*_PROMPT        L141–L144
 *
 * STATE: L150–L195
 *   userProfile L150        stats L151           users L152
 *   apiKey L153             sharedKey L154       loading L155
 *   updating L156           expandedPrompts L157 viewPrompts L158
 *   search L159             message L160         expandedUser L161
 *   newLocation L162        locationQuery L163   locationSuggestions L164
 *   locationSearching L165  activeTab L166       searchTimeout (ref) L167
 *   platformPrefs L169      platformToast L170
 *   preauths L172           preauthLoading L173  preauthForm L174
 *   preauthError L175       preauthAdding L176
 *   kwVariants L178         kwLoading L179       kwEditingId L180
 *   kwDraft L181            kwNewChip L182       kwEditChip L183
 *   kwAddingNew L184        kwNewForm L185       kwNewChipInput L186
 *   providerStates L188     keyInputs L189       showKey L190
 *   verifying L191          keyErrors L192       changingKey L193
 *   searchUsage L194        usageLoading L195
 *
 * EFFECTS:
 *   L197 Mount — calls fetchData()
 *   L224 platformPrefs — syncs from userProfile.platformPreferences
 *   L228 providerStates — syncs from userProfile.searchProviders
 *   L248 variants lazy-load — fetches kwVariants when activeTab='variants'
 *   L256 preauth lazy-load — fetches preauths when activeTab='preauth'
 *   L356 searchUsage — fetches on mount; refreshes every 5 min via setInterval
 *
 * HANDLERS:
 *   L201 fetchData              load profile + admin stats + users
 *   L233 handlePlatformToggle   toggle platform enabled; save via api; show toast
 *   L264 handleAddPreauth       validate email; call api.addPreauthorized; update list
 *   L288 handleDeletePreauth    confirm + delete pre-auth doc
 *   L294 handleKwToggle         toggle keyword variant enabled
 *   L299 handleKwDelete         delete keyword variant by id
 *   L304 handleKwEditSave       save keyword variant edit draft
 *   L311 handleKwCreate         create new keyword variant group
 *   L320 authFetch              inline fetch helper with Firebase token
 *   L338 refreshUserProfile     calls api.getMe() → setUserProfile
 *   L343 fetchSearchUsage       fetches /api/user/search-usage → setSearchUsage
 *   L362 handleSaveKey          verify + save search provider API key
 *   L381 handleToggle           toggle provider enabled via PATCH
 *   L393 handleRemove           confirm + remove provider key
 *   L404 handleSavePersonalKey  save personal Anthropic API key
 *   L421 handleDeletePersonalKey  remove personal Anthropic API key
 *   L436 handleInlineUpdate     inline-update a user field (admin)
 *   L445 toggleAccess           toggle user hasSharedAccess (admin)
 *   L457 handleSetSharedKey     set master shared key (admin)
 *
 * SECTIONS (JSX):
 *   - Sidebar nav:                   L506
 *   - Status message toast:          L547
 *   - Profile & Security tab:        L561  (Anthropic key, shared access, language)
 *   - AI Customization tab:          L683  (tone, language, 4 custom prompts)
 *   - My Locations tab:              L1006
 *   - System Health tab (admin):     L1150
 *   - Pre-authorized emails (admin): L1323
 *   - User Authority Matrix (admin): L1420
 *   - Search Platforms tab:          L1542
 *   - Keyword Variants tab:          L1585
 *   - Search Providers tab:          L1723
 *   - Infrastructure tab (admin):    L1856
 *   - App Settings tab (admin):      after Infrastructure — appConfig state + handleSaveAppConfig
 *     4 collapsible sections: discovery / providers (priority order + toggles) / ai / negotiation
 *
 * ANCHORS:
 *   - Where to add new user-facing section:  L1854 (after providers, before master)
 *   - Where to add new admin-only section:   after App Settings tab JSX closing }
 *   - authFetch helper:             L320
 *   - refreshUserProfile:           L338
 *   - Usage stats (providers map):  L1744–L1789
 *   - navItems array:               L487  (add tab id here + matching JSX section below)
 */

import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Users, Activity, ShieldCheck, Key, Save, Search, UserCog,
  TrendingUp, ChevronDown, ChevronUp, BarChart, Trash2, CheckCircle, AlertCircle,
  Settings as SettingsIcon, Shield, MessageSquare, MapPin, Globe, Plus, Trash2 as Trash,
  Home, Briefcase, Navigation, Calendar, Zap as ZapIcon, Sparkles, History, Bot, MessageCircle,
  Tag, X, Pencil, Mail
} from 'lucide-react'
import { auth } from '../firebase'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { Line } from 'react-chartjs-2'
import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const DEFAULT_PLATFORM_PREFS = { wallapop: true, vinted: true, milanuncios: true, ebay_es: true }
const PLATFORMS = [
  { key: 'wallapop',    label: 'Wallapop',    emoji: '🟠' },
  { key: 'vinted',      label: 'Vinted',      emoji: '🟢' },
  { key: 'milanuncios', label: 'Milanuncios', emoji: '🔵' },
  { key: 'ebay_es',     label: 'eBay Spain',  emoji: '🔴' },
]

const PROVIDER_INFO = {
  scrapingdog: {
    name: 'Scrapingdog', emoji: '🐕', freeInfo: '200 searches · Never resets',
    steps: ['Go to scrapingdog.com', 'Sign up free (no credit card)', 'Dashboard → copy your API key'],
    url: 'https://scrapingdog.com', closed: false,
  },
  serpapi: {
    name: 'SerpAPI', emoji: '🔍', freeInfo: '250 searches/month',
    steps: ['Go to serpapi.com', 'Click Register', 'Dashboard → copy your API key'],
    url: 'https://serpapi.com', closed: false,
  },
  serper: {
    name: 'Serper', emoji: '⚡', freeInfo: '2,500 searches/month',
    steps: [], url: 'https://serper.dev', closed: true,
  },
}

const DEFAULT_NEGOTIATION_PROMPT = 'Be professional and friendly. Always propose round prices (ending in 0 or 5). If the deal score is above 85, show extra enthusiasm in the negotiation message. Keep messages short and natural — avoid sounding like a bot.'
const DEFAULT_LISTING_PROMPT = 'Highlight the best value-for-money aspect. Mention flexibility on price and fast response. Keep it conversational — avoid generic copy-paste listing language.'
const DEFAULT_BATCH_PROMPT = 'Focus on products with the best resale margin. Be strict about filtering accessories and bundles. Flag any sellers with suspicious behaviour or vague descriptions.'
const DEFAULT_DISCUSSION_PROMPT = 'Keep replies short and natural — 2-3 sentences max. Prioritize building trust before making offers. Always suggest a round price. If the conversation is stalling, create mild urgency without being pushy.'

export default function AdminDashboard({ pipeline }) {
  const api = useApi()
  const { isAdmin, user } = useAuth()
  const { t } = useTranslation()
  const [userProfile, setUserProfile] = useState(null)
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [sharedKey, setSharedKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [expandedPrompts, setExpandedPrompts] = useState({ negotiation: false, listing: false, batch: false, discussion: false })
  const [viewPrompts, setViewPrompts] = useState({ negotiation: false, listing: false, batch: false, discussion: false })
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [expandedUser, setExpandedUser] = useState(null)
  const [newLocation, setNewLocation] = useState({ label: '', lat: '', lon: '', address: '' })
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [locationSearching, setLocationSearching] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const searchTimeout = useRef(null)

  const [platformPrefs, setPlatformPrefs] = useState(DEFAULT_PLATFORM_PREFS)
  const [platformToast, setPlatformToast] = useState('')

  const [preauths, setPreauths] = useState([])
  const [preauthLoading, setPreauthLoading] = useState(false)
  const [preauthForm, setPreauthForm] = useState({ email: '', dailyCap: 20, note: '' })
  const [preauthError, setPreauthError] = useState('')
  const [preauthAdding, setPreauthAdding] = useState(false)

  const [kwVariants, setKwVariants] = useState([])
  const [kwLoading, setKwLoading] = useState(false)
  const [kwEditingId, setKwEditingId] = useState(null)
  const [kwDraft, setKwDraft] = useState({ trigger: '', variants: [] })
  const [kwNewChip, setKwNewChip] = useState('')
  const [kwEditChip, setKwEditChip] = useState({ idx: null, val: '' })
  const [kwAddingNew, setKwAddingNew] = useState(false)
  const [kwNewForm, setKwNewForm] = useState({ trigger: '', variants: [] })
  const [kwNewChipInput, setKwNewChipInput] = useState('')

  const [providerStates, setProviderStates] = useState({})
  const [keyInputs, setKeyInputs] = useState({})
  const [showKey, setShowKey] = useState({})
  const [verifying, setVerifying] = useState({})
  const [keyErrors, setKeyErrors] = useState({})
  const [changingKey, setChangingKey] = useState({})
  const [searchUsage, setSearchUsage] = useState({})
  const [usageLoading, setUsageLoading] = useState(false)
  const [appConfig, setAppConfig] = useState(null)
  const [appConfigLoading, setAppConfigLoading] = useState(false)
  const [appConfigSaving, setAppConfigSaving] = useState(null)
  const [appConfigSuccess, setAppConfigSuccess] = useState(null)
  const [appOpenSections, setAppOpenSections] = useState({ discovery: true, providers: true, ai: true, negotiation: true })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const requests = [api.getMe()]
      if (isAdmin) {
        requests.push(api.getAdminStats())
        requests.push(api.getAdminUsers())
      }
      
      const results = await Promise.all(requests)
      setUserProfile(results[0])
      if (isAdmin) {
        setStats(results[1])
        setUsers(results[2])
      }
    } catch (err) {
      console.error('Failed to fetch management data:', err)
      setMessage({ type: 'error', text: 'Error loading management data.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userProfile?.platformPreferences) setPlatformPrefs(userProfile.platformPreferences)
  }, [userProfile])

  useEffect(() => {
    if (!userProfile?.searchProviders) return
    setProviderStates(userProfile.searchProviders)
  }, [userProfile])

  const handlePlatformToggle = async (key) => {
    const newVal = !platformPrefs[key]
    setPlatformPrefs(prev => ({ ...prev, [key]: newVal }))
    const label = PLATFORMS.find(p => p.key === key)?.label || key
    setPlatformToast(`${label} ${newVal ? 'enabled' : 'disabled'}`)
    setTimeout(() => setPlatformToast(''), 3000)
    try {
      await api.updatePlatformPreference(key, newVal)
    } catch {
      setPlatformPrefs(prev => ({ ...prev, [key]: !newVal }))
      setPlatformToast('Failed to save')
      setTimeout(() => setPlatformToast(''), 3000)
    }
  }

  useEffect(() => {
    if (activeTab !== 'variants' || kwVariants.length > 0 || kwLoading) return
    setKwLoading(true)
    api.getKeywordVariants()
      .then(data => { setKwVariants(data); setKwLoading(false) })
      .catch(() => setKwLoading(false))
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'appsettings' || appConfig || appConfigLoading) return
    setAppConfigLoading(true)
    api.getAppConfig()
      .then(data => { setAppConfig(data); setAppConfigLoading(false) })
      .catch(() => setAppConfigLoading(false))
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'preauth' || preauths.length > 0 || preauthLoading) return
    setPreauthLoading(true)
    api.getPreauthorized()
      .then(data => { setPreauths(data); setPreauthLoading(false) })
      .catch(() => setPreauthLoading(false))
  }, [activeTab])

  const handleAddPreauth = async (e) => {
    e.preventDefault()
    setPreauthError('')
    const email = preauthForm.email.trim().toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setPreauthError('Valid email required')
      return
    }
    if (preauths.some(p => p.email === email)) {
      setPreauthError('This email is already pre-authorized')
      return
    }
    setPreauthAdding(true)
    try {
      const created = await api.addPreauthorized({ email, dailyCap: Number(preauthForm.dailyCap) || 20, note: preauthForm.note, sharedKeyEnabled: true })
      setPreauths(prev => [created, ...prev])
      setPreauthForm({ email: '', dailyCap: 20, note: '' })
    } catch (err) {
      setPreauthError(err.message || 'Failed to add')
    } finally {
      setPreauthAdding(false)
    }
  }

  const handleDeletePreauth = async (p) => {
    if (!window.confirm(`Remove pre-authorization for ${p.email}?`)) return
    await api.deletePreauthorized(p.id)
    setPreauths(prev => prev.filter(x => x.id !== p.id))
  }

  const handleKwToggle = async (v) => {
    const updated = await api.updateKeywordVariant(v.id, { enabled: !v.enabled })
    setKwVariants(prev => prev.map(x => x.id === v.id ? updated : x))
  }

  const handleKwDelete = async (id) => {
    await api.deleteKeywordVariant(id)
    setKwVariants(prev => prev.filter(x => x.id !== id))
  }

  const handleKwEditSave = async () => {
    const updated = await api.updateKeywordVariant(kwEditingId, kwDraft)
    setKwVariants(prev => prev.map(x => x.id === kwEditingId ? updated : x))
    setKwEditingId(null)
    setKwNewChip('')
  }

  const handleKwCreate = async () => {
    if (!kwNewForm.trigger.trim() || kwNewForm.variants.length === 0) return
    const created = await api.createKeywordVariant({ ...kwNewForm, source: 'user' })
    setKwVariants(prev => [...prev, created])
    setKwAddingNew(false)
    setKwNewForm({ trigger: '', variants: [] })
    setKwNewChipInput('')
  }

  const authFetch = async (path, options = {}) => {
    const token = await auth.currentUser.getIdToken()
    const base = import.meta.env.VITE_API_URL || ''
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw err
    }
    return res.json()
  }

  const refreshUserProfile = async () => {
    const meData = await api.getMe()
    setUserProfile(meData)
  }

  const fetchSearchUsage = async () => {
    if (!user) return
    setUsageLoading(true)
    try {
      const data = await authFetch('/api/user/search-usage')
      setSearchUsage(data.providers || {})
    } catch {
      // silent
    } finally {
      setUsageLoading(false)
    }
  }

  useEffect(() => {
    fetchSearchUsage()
    const id = setInterval(fetchSearchUsage, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line

  const handleSaveKey = (provider) => async () => {
    setVerifying(p => ({ ...p, [provider]: true }))
    setKeyErrors(p => ({ ...p, [provider]: '' }))
    try {
      await authFetch('/api/user/search-key', {
        method: 'POST',
        body: JSON.stringify({ provider, apiKey: keyInputs[provider] }),
      })
      setKeyInputs(p => ({ ...p, [provider]: '' }))
      setChangingKey(p => ({ ...p, [provider]: false }))
      await refreshUserProfile()
      fetchSearchUsage()
    } catch (err) {
      setKeyErrors(p => ({ ...p, [provider]: err.message || t('settings.searchProviders.keyInvalid') }))
    } finally {
      setVerifying(p => ({ ...p, [provider]: false }))
    }
  }

  const handleToggle = async (provider, enabled) => {
    setProviderStates(p => ({ ...p, [provider]: { ...p[provider], enabled } }))
    try {
      await authFetch(`/api/user/search-key/${provider}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      })
    } catch {
      setProviderStates(p => ({ ...p, [provider]: { ...p[provider], enabled: !enabled } }))
    }
  }

  const handleRemove = async (provider) => {
    if (!window.confirm(t('settings.searchProviders.confirmRemove', { provider: PROVIDER_INFO[provider].name }))) return
    try {
      await authFetch(`/api/user/search-key/${provider}`, { method: 'DELETE' })
      await refreshUserProfile()
      fetchSearchUsage()
    } catch (err) {
      console.error('Remove key failed', err)
    }
  }

  const handleSavePersonalKey = async (e) => {
    e.preventDefault()
    if (!apiKey.trim()) return
    setUpdating(true)
    try {
      await api.setApiKey(apiKey)
      setMessage({ type: 'success', text: 'Personal API Key saved and encrypted!' })
      setApiKey('')
      const meData = await api.getMe()
      setUserProfile(meData)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUpdating(false)
    }
  }

  const handleDeletePersonalKey = async () => {
    if (!window.confirm('Remove your personal API key?')) return
    setUpdating(true)
    try {
      await api.deleteApiKey()
      setMessage({ type: 'success', text: 'Personal API Key removed.' })
      const meData = await api.getMe()
      setUserProfile(meData)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUpdating(false)
    }
  }

  const handleInlineUpdate = async (uid, field, value) => {
    try {
      await api.updateUser(uid, { [field]: value })
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, [field]: value } : u))
    } catch (err) {
      setMessage({ type: 'error', text: 'Update failed: ' + err.message })
    }
  }

  const toggleAccess = async (uid, current) => {
    setUpdating(true)
    try {
      await api.updateUser(uid, { hasSharedAccess: !current })
      fetchData()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUpdating(false)
    }
  }

  const handleSetSharedKey = async (e) => {
    e.preventDefault()
    if (!sharedKey.trim()) return
    setUpdating(true)
    try {
      await api.setSharedKey(sharedKey)
      setMessage({ type: 'success', text: 'Master shared API key updated.' })
      setSharedKey('')
      fetchData()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="spinner w-10 h-10" />
      </div>
    )
  }

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  )


  const handleSaveAppConfig = async (section) => {
    if (!appConfig) return
    setAppConfigSaving(section)
    try {
      await api.updateAppConfig(section, appConfig[section])
      setAppConfigSuccess(section)
      setTimeout(() => setAppConfigSuccess(null), 3000)
    } catch (e) {
      console.error('App config save failed:', e)
    } finally {
      setAppConfigSaving(null)
    }
  }

  const navItems = [
    { id: 'profile', label: 'Profile & Security', icon: Key },
    { id: 'locations', label: 'My Locations', icon: MapPin },
    { id: 'ai', label: 'AI Customization', icon: Sparkles },
    { id: 'variants', label: 'Keyword Variants', icon: Tag },
    { id: 'platforms', label: 'Search Platforms', icon: Globe },
    { id: 'providers', label: 'Search Providers', icon: Search },
    ...(isAdmin ? [
      { id: 'stats', label: 'System Health', icon: Activity },
      { id: 'preauth', label: 'Pre-authorized', icon: Mail },
      { id: 'users', label: 'User Controls', icon: UserCog },
      { id: 'master', label: 'Infrastructure', icon: ShieldCheck },
      { id: 'appsettings', label: 'App Settings', icon: SettingsIcon }
    ] : [])
  ]

  return (
    <div className="page-container relative max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 shrink-0 lg:sticky lg:top-24">
          <div className="card border-slate-700/10 bg-gradient-to-br from-blue-500/[0.03] to-indigo-500/[0.03] p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <img src={userProfile?.photoURL} className="w-10 h-10 rounded-full border border-slate-700 shadow-lg" alt="" />
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-100 truncate">{userProfile?.displayName}</div>
                <div className="text-[10px] text-slate-500 truncate">{userProfile?.role || 'User'}</div>
              </div>
            </div>
            <div className={`text-[9px] font-black uppercase tracking-tighter text-center py-1 rounded border overflow-hidden ${
              isAdmin ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}>
              {isAdmin ? 'Admin Console Active' : 'Verified Operation'}
            </div>
          </div>

          <div className="card p-2 border-slate-700/30 shadow-2xl space-y-1">
            <div className="px-4 py-3 mb-2">
               <h1 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <SettingsIcon className="w-4 h-4" /> Management
               </h1>
            </div>
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  activeTab === item.id 
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <item.icon className={`w-4 h-4 ${activeTab === item.id ? 'text-blue-400' : 'text-slate-500'}`} />
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 w-full min-w-0 pb-12">
          {message.text && (
            <div className={`p-4 rounded-xl mb-8 border animate-fade-in flex items-center justify-between shadow-xl ${
              message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-100' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100'
            }`}>
              <div className="flex items-center gap-3">
                {message.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-500" /> : <CheckCircle className="w-5 h-5 text-emerald-500" />}
                <span className="text-sm font-medium">{message.text}</span>
              </div>
              <button onClick={() => setMessage({ type: '', text: '' })} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <Plus className="w-4 h-4 rotate-45 opacity-40 hover:opacity-100" />
              </button>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
          <div className="card p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-500" />
              My Anthropic API Key
            </h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Use your personal key for unlimited AI features. All keys are <strong>encrypted at rest</strong>.
            </p>

            {userProfile?.api_key_masked ? (
              <div className="bg-surface-900 rounded-xl p-4 border border-blue-500/20 mb-6 flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-200">Personal Key Active</div>
                    <div className="text-[10px] text-slate-500 font-mono tracking-wider italic">Unlimited Access Enabled</div>
                  </div>
                </div>
                <button 
                  onClick={handleDeletePersonalKey}
                  className="p-2 text-slate-500 hover:text-red-400 transition-all hover:scale-110"
                  disabled={updating}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ) : userProfile?.hasSharedAccess ? (
              <div className="bg-emerald-500/5 rounded-xl p-5 border border-emerald-500/20 mb-6 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-200">Using Shared Credits</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Daily Allowance Active</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-emerald-400 tabular-nums">
                      {userProfile.usageToday || 0} / {userProfile.dailyCap || 5}
                    </div>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                    style={{ width: `${Math.min(100, ((userProfile.usageToday || 0) / (userProfile.dailyCap || 5)) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/20 mb-6 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <div className="text-xs text-red-200/50 font-medium">
                  Add your own API key below to unlock AI-powered scouting and negotiation.
                </div>
              </div>
            )}

            <form onSubmit={handleSavePersonalKey} className="space-y-4 mb-8">
              <div className="relative">
                <input 
                  type="password"
                  className="input pr-10 text-sm py-2.5"
                  placeholder="sk-ant-api..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  disabled={updating}
                />
                <Key className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              </div>
              <button 
                type="submit" 
                className="btn-primary w-full justify-center py-2.5 shadow-lg shadow-blue-500/10 active:scale-95 transition-transform"
                disabled={updating || !apiKey.trim()}
              >
                {updating ? <span className="spinner w-4 h-4" /> : <Save className="w-4 h-4" />}
                {updating ? 'Securing...' : 'Encrypt & Save Key'}
              </button>
            </form>

            <div className="pt-6 border-t border-slate-700/50">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                Language Preferences
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block">Interface & AI Analysis</label>
                  <select 
                    className="input w-full bg-surface-900 border-slate-700/50 text-sm"
                    value={userProfile?.preferred_language || 'en'}
                    onChange={async (e) => {
                      setUpdating(true)
                      try {
                        await api.updateSettings({ preferred_language: e.target.value })
                        setMessage({ type: 'success', text: 'Preferred language updated!' })
                        fetchData()
                      } catch (err) {
                        setMessage({ type: 'error', text: err.message })
                      } finally {
                        setUpdating(false)
                      }
                    }}
                    disabled={updating}
                  >
                    <option value="en">English (US/UK)</option>
                    <option value="es">Español (España)</option>
                    <option value="ca">Català</option>
                  </select>
                </div>
              </div>
              </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="card p-8 border-slate-700/30 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] -mr-8 -mt-8">
              <Sparkles className="w-48 h-48 text-blue-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-100 mb-2 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 text-white" />
              </div>
              AI Settings
            </h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-2xl">
              Configure tone, language, and custom instructions for each AI feature independently.
            </p>

            {/* Global settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-surface-900/50 rounded-2xl border border-slate-700/30 mb-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  Default Negotiation Tone
                </h3>
                <select
                  className="input w-full bg-surface-950 border-slate-700/50 text-sm"
                  value={userProfile?.default_tone || 'friendly'}
                  onChange={async (e) => {
                    setUpdating(true)
                    try {
                      await api.updateSettings({ default_tone: e.target.value })
                      setMessage({ type: 'success', text: 'Default tone updated successfully!' })
                      fetchData()
                    } catch (err) {
                      setMessage({ type: 'error', text: err.message })
                    } finally { setUpdating(false) }
                  }}
                  disabled={updating}
                >
                  <option value="friendly">Friendly - Warm & Approachable</option>
                  <option value="firm">Firm - Professional & Direct</option>
                  <option value="curious">Curious - Interested & Analytical</option>
                </select>
                <p className="text-[10px] text-slate-500 italic">Tone for automatic analysis results.</p>
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  Messages generation
                </h3>
                <select
                  className="input w-full bg-surface-950 border-slate-700/50 text-sm"
                  value={userProfile?.negotiation_language || 'es'}
                  onChange={async (e) => {
                    setUpdating(true)
                    try {
                      await api.updateSettings({ negotiation_language: e.target.value })
                      setMessage({ type: 'success', text: 'Generation language updated!' })
                      fetchData()
                    } catch (err) {
                      setMessage({ type: 'error', text: err.message })
                    } finally { setUpdating(false) }
                  }}
                  disabled={updating}
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="ca">Català</option>
                </select>
                <p className="text-[10px] text-slate-500 italic">Language for AI-generated messages.</p>
              </div>
            </div>

            {/* Foldable prompt sections */}
            <div className="mb-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Custom Prompts</h3>
              <p className="text-xs text-slate-500 mt-1">Override the default AI instructions per feature.</p>
            </div>
            <div className="space-y-3">

              {/* Negotiation Analysis */}
              {[
                {
                  key: 'negotiation',
                  label: 'Negotiation Analysis',
                  icon: <MessageCircle className="w-4 h-4 text-indigo-400" />,
                  accent: 'indigo',
                  field: 'custom_negotiation_prompt',
                  defaultPrompt: DEFAULT_NEGOTIATION_PROMPT,
                  placeholder: 'e.g. Always propose round prices. Be friendly but firm on the target price.',
                  successMsg: 'Negotiation prompt saved!',
                  systemPrompt: `Analyze this Wallapop product and provide a complete flipping strategy and negotiation plan.
[ADDITIONAL INSTRUCTIONS FROM USER — injected here if set]

Product: {product}
Condition: {condition}
Listed price: {listed_price}€
My target price: {target_price}€
My target margin: {target_margin}%
Negotiation tone: {tone_desc}
Seller description: {description}

Return ONLY a JSON object with this exact structure:
{
  "negotiation": { "opener", "follow_up", "counter_response", "walk_away_line" },
  "market_data": { "brand_new_price", "brand_new_source", "avg_second_hand_price", "second_hand_source", "release_date", "price_trend" },
  "flip_analysis": { "deal_score", "reasoning", "suggested_buy_max", "suggested_resell_price", "estimated_profit", "real_margin_pct", "time_to_sell_estimate", "complexity", "needs_repair", "repair_estimate", "net_profit_after_repair" },
  "red_flags": { "detected", "flags", "risk_level" },
  "verdict": "buy|negotiate|pass"
}

[17 critical rules enforced by the system — language, pricing formulas, red flag detection, verdict logic, etc.]`,
                },
                {
                  key: 'listing',
                  label: 'Listing Generator',
                  icon: <ZapIcon className="w-4 h-4 text-emerald-400" />,
                  accent: 'emerald',
                  field: 'custom_listing_prompt',
                  defaultPrompt: DEFAULT_LISTING_PROMPT,
                  placeholder: 'e.g. Always highlight fast shipping. Mention you respond quickly.',
                  successMsg: 'Listing prompt saved!',
                  systemPrompt: `You are an expert Wallapop seller in Spain. Generate a {style} product listing in {language} that maximizes views and conversion.
[ADDITIONAL INSTRUCTIONS FROM USER — injected here if set]

Use tone: {tone_desc}
{lang_instruction}

Product: {product}
Condition: {condition}
Bought at: {bought_price}€
Target sell price: {target_sell}€
Target margin: {target_margin}%

Return ONLY valid JSON with this exact structure:
{
  "title": "...",
  "price": {target_sell},
  "description": "...",
  "tags": ["...", "...", "...", "...", "..."],
  "pricing_analysis": { "suggested_price", "min_acceptable", "price_reasoning" },
  "seo": { "search_keywords", "best_category" },
  "selling_tips": ["...", "...", "..."]
}

[12 critical rules enforced by the system — title format, description structure, pricing formula, SEO, tone, language, etc.]`,
                },
                {
                  key: 'batch',
                  label: 'Bulk Discovery',
                  icon: <Search className="w-4 h-4 text-amber-400" />,
                  accent: 'amber',
                  field: 'custom_batch_prompt',
                  defaultPrompt: DEFAULT_BATCH_PROMPT,
                  placeholder: 'e.g. Only flag deals with 25%+ margin. Be very strict with accessories.',
                  successMsg: 'Discovery prompt saved!',
                  systemPrompt: `You are an expert second-hand product flipper in Spain with deep knowledge of Wallapop market prices, demand trends, and resale margins.
[ADDITIONAL INSTRUCTIONS FROM USER — injected here if set]

The user is searching for: "{keywords}"
User's target margin: {target_margin}%
User's max budget: {max_budget}€
User's location: {location}

PRODUCTS TO ANALYZE:
{items_str}

4-step analysis enforced by the system:
  STEP 1 — Relevance filter (discard accessories, shop sellers, scams, out-of-budget items)
  STEP 2 — Flip score 0-100 (price vs market 40pts, demand 25pts, condition 20pts, seller trust 15pts)
  STEP 3 — Target buy price (negotiation discount + max buy for margin formula)
  STEP 4 — Profit projection (net_profit, real_margin after Wallapop 10% fee)

Return ONLY a JSON array sorted by score desc. Each item includes:
{ "id", "title", "listed_price", "score", "verdict", "target_buy", "estimated_resell", "net_profit", "real_margin_pct", "time_to_sell", "reason", "negotiation_angle", "red_flags" }

[8 critical rules enforced by the system — sorting, filtering, conservative resell estimates, verdict logic, etc.]`,
                },
                {
                  key: 'discussion',
                  label: 'Discussion Helper',
                  icon: <MessageCircle className="w-4 h-4 text-emerald-400" />,
                  accent: 'emerald',
                  field: 'custom_discussion_prompt',
                  defaultPrompt: DEFAULT_DISCUSSION_PROMPT,
                  placeholder: 'e.g. Always propose round prices. Be brief and friendly. If stalling, create mild urgency.',
                  successMsg: 'Discussion prompt saved!',
                  systemPrompt: `You are an expert negotiation assistant for FlipOps. You help the user craft strategic, natural replies in real Wallapop conversations.
[ADDITIONAL INSTRUCTIONS FROM USER — injected here if set]

The user is acting as: {role} (buying or selling)
Role goal: get the best price while keeping the counterpart engaged.

PRODUCT CONTEXT: title, listed_price, condition, description, target_price, walk_away_price
CONVERSATION: full history + last message received

4-step reasoning enforced by the system:
  STEP 1 — Situation analysis (negotiation stage, counterpart stance, red flags, price agreement, appointment)
  STEP 2 — Reply strategy (stage-aware tactics for buying and selling flows)
  STEP 3 — Appointment detection (date, time, location, address, phone, confirmed by both parties?)
  STEP 4 — Price agreement detection (strict: only agreed when BOTH parties confirmed same price)

Return ONLY valid JSON:
{
  "reply": "...",                      ← written in the user's negotiation language
  "reply_tone": "friendly|firm|urgent|warm|neutral",
  "situation_summary": "...",          ← one sentence in UI language
  "negotiation_stage": "opening|negotiating|closing|agreed|stalled|dead",
  "counterpart_stance": "flexible|firm|interested|losing_interest|rushing|suspicious",
  "strategy_used": "...",              ← why this reply was chosen
  "agreed_price": null,
  "price_trend": "holding|dropping|rising",
  "appointment": { detected, confirmed, type, date, time, location, address, phone, reason },
  "red_flags": [],
  "suggested_next_moves": ["...", "...", "..."],
  "walk_away_recommended": false,
  "walk_away_reason": null
}

[10 critical rules — reply language, summary language, walk-away logic, scam detection, etc.]`,
                },
              ].map(({ key, label, icon, accent, field, defaultPrompt, placeholder, successMsg, systemPrompt }) => (
                <div key={key} className="border border-slate-700/40 rounded-2xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 bg-surface-900/40 hover:bg-surface-900/70 transition-colors text-left"
                    onClick={() => setExpandedPrompts(prev => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-300">
                      {icon}
                      {label}
                      {userProfile?.[field] && (
                        <span className={`text-[10px] font-black uppercase tracking-widest text-${accent}-400 bg-${accent}-400/10 px-2 py-0.5 rounded-full`}>
                          Custom
                        </span>
                      )}
                    </span>
                    {expandedPrompts[key]
                      ? <ChevronUp className="w-4 h-4 text-slate-500" />
                      : <ChevronDown className="w-4 h-4 text-slate-500" />
                    }
                  </button>
                  {expandedPrompts[key] && (
                    <div className="px-5 pb-5 pt-4 space-y-4 bg-surface-900/20">
                      <textarea
                        className="w-full bg-surface-900 border border-slate-700/50 rounded-2xl p-4 text-sm font-medium text-slate-200 focus:ring-2 ring-blue-500/50 min-h-[140px] transition-all resize-none shadow-inner"
                        placeholder={placeholder}
                        value={userProfile?.[field] || defaultPrompt}
                        onChange={(e) => setUserProfile(prev => ({ ...prev, [field]: e.target.value }))}
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={async () => {
                            setUpdating(true)
                            try {
                              await api.updateSettings({ [field]: userProfile[field] })
                              setMessage({ type: 'success', text: successMsg })
                            } catch (err) {
                              setMessage({ type: 'error', text: err.message })
                            } finally { setUpdating(false) }
                          }}
                          disabled={updating}
                          className="btn-primary flex-1 justify-center py-2.5 rounded-xl shadow-lg shadow-blue-500/10 text-sm"
                        >
                          {updating ? <span className="spinner w-4 h-4" /> : <Save className="w-4 h-4" />}
                          Save
                        </button>
                        <button
                          onClick={() => setViewPrompts(prev => ({ ...prev, [key]: !prev[key] }))}
                          className="px-5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-400 text-sm font-bold transition-all"
                        >
                          {viewPrompts[key] ? 'Hide Prompt' : 'Complete Prompt'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm('Revert to default instructions?')) return
                            setUpdating(true)
                            try {
                              await api.updateSettings({ [field]: '' })
                              setUserProfile(prev => ({ ...prev, [field]: '' }))
                              setMessage({ type: 'success', text: 'Reverted to default.' })
                            } catch (err) {
                              setMessage({ type: 'error', text: err.message })
                            } finally { setUpdating(false) }
                          }}
                          disabled={updating}
                          className="px-5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-400 text-sm font-bold transition-all"
                        >
                          Restore Default
                        </button>
                      </div>
                      {viewPrompts[key] && (
                        <div className="rounded-xl border border-slate-700/40 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2 bg-slate-800/60 border-b border-slate-700/40">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Prompt — Read Only</span>
                          </div>
                          <pre className="p-4 text-xs text-slate-400 leading-relaxed whitespace-pre-wrap font-mono bg-slate-900/60 overflow-auto max-h-72">{systemPrompt}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-6 bg-blue-500/5 border-blue-500/10">
              <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Pro Tip: Strategic Tone</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Combine custom prompts with the <strong>Default Tone</strong> setting above. The AI will merge your directives with the chosen tone for every response.
              </p>
            </div>
            <div className="card p-6 bg-amber-500/5 border-amber-500/10">
              <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest mb-4">Safety Warning</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Avoid adding sensitive personal data to prompts. These instructions are sent to the AI every time it acts on your behalf.
              </p>
            </div>
          </div>
        </div>
      )}


      {activeTab === 'locations' && (
        <div className="max-w-2xl mx-auto animate-in slide-in-from-right-4 duration-300">
          <div className="card p-6 border-slate-700/30 shadow-lg">
            <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-red-400" />
              My Locations
            </h2>
            <p className="text-[10px] text-slate-500 mb-6 leading-relaxed">
              Add addresses to calculate distances to sellers in real-time.
            </p>

            <div className="space-y-3 mb-6">
              {(userProfile?.locations || []).map((loc, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-surface-900 rounded-xl border border-slate-700/30 group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                      {loc.label?.toLowerCase().includes('home') ? <Home className="w-4 h-4" /> : 
                       loc.label?.toLowerCase().includes('work') ? <Briefcase className="w-4 h-4" /> : 
                       <Navigation className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="text-xs font-bold text-slate-200">{loc.label}</div>
                      {loc.address ? (
                        <div className="text-[10px] text-slate-500 line-clamp-3 leading-snug pb-1 mt-0.5">
                          {loc.address}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 font-mono pb-1 mt-0.5 opacity-50">
                          Lat: {parseFloat(loc.lat).toFixed(4)}, Lon: {parseFloat(loc.lon).toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      setUpdating(true)
                      try {
                        const updated = (userProfile.locations || []).filter((_, i) => i !== idx)
                        await api.updateSettings({ locations: updated })
                        fetchData()
                      } catch (err) {
                        setMessage({ type: 'error', text: err.message })
                      } finally {
                        setUpdating(false)
                      }
                    }}
                    className="p-1.5 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t border-slate-800 pt-4">
              <input
                className="input py-1.5 text-xs"
                placeholder="Label (e.g. Home, Office)"
                value={newLocation.label}
                onChange={e => setNewLocation(prev => ({ ...prev, label: e.target.value }))}
              />
              <div className="relative">
                <input
                  className="input py-1.5 text-xs"
                  placeholder="Search address or city…"
                  value={locationQuery}
                  onChange={e => {
                    const q = e.target.value
                    setLocationQuery(q)
                    setNewLocation(prev => ({ ...prev, lat: '', lon: '' }))
                    if (q.length < 3) { setLocationSuggestions([]); return }
                    
                    if (searchTimeout.current) clearTimeout(searchTimeout.current)
                    
                    searchTimeout.current = setTimeout(async () => {
                      setLocationSearching(true)
                      try {
                        const results = await api.geocode(q)
                        setLocationSuggestions(Array.isArray(results) ? results : [])
                      } catch { 
                        setLocationSuggestions([]) 
                      } finally { 
                        setLocationSearching(false) 
                      }
                    }, 800)
                  }}
                />
                {locationSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="spinner w-3 h-3" />
                  </div>
                )}
                {locationSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                    {locationSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                        onClick={() => {
                          setNewLocation(prev => ({ ...prev, lat: s.lat, lon: s.lon, address: s.display_name }))
                          setLocationQuery(s.display_name.split(',').slice(0, 2).join(','))
                          setLocationSuggestions([])
                        }}
                      >
                        <span className="font-bold text-slate-200">{s.display_name.split(',')[0]}</span>
                        <span className="text-slate-500 ml-1">{s.display_name.split(',').slice(1, 3).join(',')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {newLocation.lat && (
                <div className="text-[9px] text-slate-600 font-mono px-1">
                  {parseFloat(newLocation.lat).toFixed(4)}, {parseFloat(newLocation.lon).toFixed(4)}
                </div>
              )}
              <button
                type="button"
                className="btn-primary w-full justify-center py-1.5 text-xs"
                disabled={updating || !newLocation.label || !newLocation.lat}
                onClick={async () => {
                  if (!newLocation.label || !newLocation.lat) return
                  setUpdating(true)
                  try {
                    const updated = [...(userProfile.locations || []), newLocation]
                    await api.updateSettings({ locations: updated })
                    setNewLocation({ label: '', lat: '', lon: '', address: '' })
                    setLocationQuery('')
                    fetchData()
                  } catch (err) {
                    setMessage({ type: 'error', text: err.message })
                  } finally {
                    setUpdating(false)
                  }
                }}
              >
                <Plus className="w-3 h-3" /> Add Location
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stats' && isAdmin && (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-3">
             <Activity className="w-6 h-6 text-emerald-400" />
             Infrastructure Performance
          </h2>

          {/* Top KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-5 flex items-center gap-4 hover:border-blue-500/30 transition-colors bg-blue-500/[0.02]">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Users</div>
                <div className="text-2xl font-black text-slate-100 tabular-nums">{stats?.totalUsers || 0}</div>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4 hover:border-emerald-500/30 transition-colors bg-emerald-500/[0.02]">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total AI Calls</div>
                <div className="text-2xl font-black text-slate-100 tabular-nums">{stats?.totalUsage || 0}</div>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4 hover:border-amber-500/30 transition-colors bg-amber-500/[0.02]">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                <ZapIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Calls Today</div>
                <div className="text-2xl font-black text-amber-400 tabular-nums">{stats?.callsToday || 0}</div>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4 hover:border-purple-500/30 transition-colors bg-purple-500/[0.02]">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avg / User</div>
                <div className="text-2xl font-black text-purple-400 tabular-nums">{stats?.avgUsagePerUser || 0}</div>
              </div>
            </div>
          </div>

          {/* Second Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 flex items-center gap-4 hover:border-blue-500/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Own API Key</div>
                <div className="text-xl font-black text-slate-100 tabular-nums">{stats?.ownKeyUsers || 0} <span className="text-sm font-medium text-slate-500">users</span></div>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4 hover:border-emerald-500/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Subsidized</div>
                <div className="text-xl font-black text-slate-100 tabular-nums">{stats?.activeSharedUsers || 0} <span className="text-sm font-medium text-slate-500">users</span></div>
              </div>
            </div>
            <div className="card p-5 flex flex-col gap-1 hover:border-amber-500/30 transition-colors">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Most Active User</div>
              <div className="text-base font-black text-amber-400 truncate">{stats?.mostActiveUser || '—'}</div>
              <div className="text-xs text-slate-500">{stats?.mostActiveUserCalls || 0} lifetime calls</div>
            </div>
          </div>

          {/* Aggregate calls chart */}
          {stats?.aggregatedHistory && Object.keys(stats.aggregatedHistory).length > 0 && (() => {
            const labels = Object.keys(stats.aggregatedHistory)
            const values = Object.values(stats.aggregatedHistory)
            const chartData = {
              labels,
              datasets: [{
                label: 'Total AI Calls',
                data: values,
                fill: true,
                tension: 0.4,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                pointBackgroundColor: 'rgb(59, 130, 246)',
                pointRadius: 4,
                pointHoverRadius: 6,
              }]
            }
            const chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  borderWidth: 1,
                  titleColor: '#94a3b8',
                  bodyColor: '#e2e8f0',
                  callbacks: {
                    title: (items) => items[0].label,
                    label: (item) => ` ${item.formattedValue} calls`
                  }
                }
              },
              scales: {
                x: { grid: { color: 'rgba(51,65,85,0.4)' }, ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 10 } },
                y: { grid: { color: 'rgba(51,65,85,0.4)' }, ticks: { color: '#475569', font: { size: 10 } }, beginAtZero: true, precision: 0 }
              }
            }
            return (
              <div className="card p-6 border-slate-700/50">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <BarChart className="w-3.5 h-3.5" /> Total AI Calls Over Time (All Users)
                </h3>
                <div style={{ height: '220px' }}>
                  <Line data={chartData} options={chartOptions} />
                </div>
              </div>
            )
          })()}

          {/* User breakdown table */}
          {users.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Usage Breakdown by User</h3>
              <div className="card border-slate-700/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 bg-surface-900/80">
                        <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">User</th>
                        <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Lifetime Calls</th>
                        <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Access Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {[...users].sort((a, b) => (b.totalUsage || 0) - (a.totalUsage || 0)).map(u => (
                        <tr key={u.uid} className="hover:bg-slate-800/20 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {u.photoURL && <img src={u.photoURL} className="w-6 h-6 rounded-full" alt="" />}
                              <div>
                                <div className="font-bold text-slate-200 text-xs truncate max-w-[140px]">{u.displayName}</div>
                                <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center font-black text-slate-300 tabular-nums">{u.totalUsage || 0}</td>
                          <td className="px-5 py-3 text-center">
                            {u.hasOwnKey
                              ? <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Own Key</span>
                              : u.hasSharedAccess
                                ? <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Subsidized</span>
                                : <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 border border-slate-700/50">None</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {activeTab === 'preauth' && isAdmin && (() => {
        const relTime = (iso) => {
          if (!iso) return '—'
          const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
          if (m < 60) return `${m}m ago`
          const h = Math.floor(m / 60)
          if (h < 24) return `${h}h ago`
          return `${Math.floor(h / 24)}d ago`
        }
        return (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <h3 className="text-xl font-black text-slate-100 flex items-center gap-3">
              <Mail className="w-6 h-6 text-blue-400" />
              Pre-authorized emails
            </h3>

            <div className="card overflow-hidden">
              {preauthLoading ? (
                <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
              ) : preauths.length === 0 ? (
                <div className="p-8 text-center text-slate-600 text-sm italic">No pre-authorized emails yet.</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-700">
                      {['Email', 'Cap', 'Note', 'Added', ''].map(h => (
                        <th key={h} className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preauths.map(p => (
                      <tr key={p.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                        <td className="py-3 px-4 text-sm text-slate-200">{p.email}</td>
                        <td className="py-3 px-4 text-sm text-blue-400 font-bold">{p.dailyCap}</td>
                        <td className="py-3 px-4 text-sm text-slate-500">{p.note || '—'}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{relTime(p.addedAt)}</td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleDeletePreauth(p)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                            title="Remove"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card p-5">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Add pre-authorization</h4>
              <form onSubmit={handleAddPreauth} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="friend@gmail.com"
                    value={preauthForm.email}
                    onChange={e => setPreauthForm(f => ({ ...f, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="w-24">
                  <label className="label">Daily cap</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="200"
                    value={preauthForm.dailyCap}
                    onChange={e => setPreauthForm(f => ({ ...f, dailyCap: e.target.value }))}
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="label">Note (optional)</label>
                  <input
                    className="input"
                    placeholder="John BCN"
                    value={preauthForm.note}
                    onChange={e => setPreauthForm(f => ({ ...f, note: e.target.value }))}
                  />
                </div>
                <button type="submit" className="btn-primary shrink-0" disabled={preauthAdding}>
                  {preauthAdding ? 'Adding…' : 'Pre-authorize'}
                </button>
              </form>
              {preauthError && <p className="mt-2 text-xs text-red-400">{preauthError}</p>}
            </div>
          </div>
        )
      })()}

      {activeTab === 'users' && isAdmin && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-100 flex items-center gap-3">
              <UserCog className="w-6 h-6 text-blue-400" />
              User Authority Matrix
            </h3>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                className="input pl-10 py-2 text-sm focus:ring-2 ring-blue-500/30" 
                placeholder="Search by name or email..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card shadow-2xl border-slate-700/50 w-full overflow-hidden">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left table-auto">
                    <thead>
                      <tr className="border-b border-slate-700 bg-surface-900/80 backdrop-blur-sm">
                        <th className="py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-tighter min-w-[150px]">Member</th>
                        <th className="py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-tighter w-24">Cap</th>
                        <th className="py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-tighter w-24">Role</th>
                        <th className="py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-tighter text-center w-24">Access</th>
                        <th className="py-4 px-5 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredUsers.map(u => (
                        <React.Fragment key={u.uid}>
                          <tr 
                            className={`hover:bg-blue-500/[0.03] transition-colors cursor-pointer group ${expandedUser === u.uid ? 'bg-blue-500/5' : ''}`}
                          onClick={() => setExpandedUser(expandedUser === u.uid ? null : u.uid)}
                        >
                          <td className="py-4 px-3 md:px-5">
                            <div className="flex items-center gap-3">
                              <img src={u.photoURL} className="w-8 h-8 rounded-full bg-slate-800 shadow shadow-black/40 border border-slate-700 shrink-0" alt="" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-slate-200 group-hover:text-blue-400 transition-colors truncate">{u.displayName}</div>
                                <div className="text-[9px] text-slate-500 font-mono italic truncate">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-3 md:px-5" onClick={e => e.stopPropagation()}>
                            <div className="relative">
                              <input 
                                type="number" 
                                className="bg-transparent border-none text-blue-400 font-black text-sm w-full p-0 focus:ring-0 max-w-[60px]"
                                defaultValue={u.dailyCap || 5}
                                onBlur={(e) => handleInlineUpdate(u.uid, 'dailyCap', parseInt(e.target.value, 10))}
                                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                              />
                            </div>
                          </td>
                          <td className="py-4 px-5" onClick={e => e.stopPropagation()}>
                            <select 
                              className="bg-slate-800 border border-slate-700 rounded text-[10px] font-black text-slate-300 px-1 py-0.5 focus:ring-1 ring-blue-500/50 cursor-pointer appearance-none text-center outline-none"
                              value={u.role || 'user'}
                              onChange={(e) => handleInlineUpdate(u.uid, 'role', e.target.value)}
                            >
                              <option value="user">USER</option>
                              <option value="admin">ADMIN</option>
                            </select>
                          </td>
                          <td className="py-4 px-5" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-center">
                              <button 
                                onClick={() => toggleAccess(u.uid, u.hasSharedAccess)}
                                className={`w-8 h-4 rounded-full relative transition-all duration-300 ${u.hasSharedAccess ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-700'}`}
                              >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300 ${u.hasSharedAccess ? 'left-4.5' : 'left-0.5'}`} />
                              </button>
                            </div>
                          </td>
                          <td className="py-4 px-5">
                             {expandedUser === u.uid ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
                          </td>
                        </tr>
                        {expandedUser === u.uid && (
                          <tr className="bg-surface-950/30">
                            <td colSpan="5" className="p-0">
                              <div className="sticky left-0 w-[calc(100vw-3rem)] md:w-full p-4 md:p-8 animate-fade-in border-l-4 border-blue-500 bg-gradient-to-r from-blue-500/[0.02] to-transparent overflow-hidden">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 min-w-0 w-full">
                                  <div className="lg:col-span-2 min-w-0 w-full overflow-hidden">
                                    <UsageChart history={u.usageHistory || {}} />
                                  </div>
                                  <div className="bg-slate-800/20 rounded-2xl p-5 md:p-6 border border-slate-700/30 shadow-inner flex flex-col justify-center">
                                    <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-6">User Snapshot</h4>
                                    <div className="space-y-4">
                                      <div className="flex justify-between items-center group/stat">
                                        <span className="text-[10px] text-slate-500 font-bold">LIFETIME CALLS</span>
                                        <span className="text-sm font-black text-slate-200 tabular-nums">{u.totalUsage || 0}</span>
                                      </div>
                                      <div className="flex justify-between items-center group/stat">
                                        <span className="text-[10px] text-slate-500 font-bold">TODAY'S CALLS</span>
                                        <span className="text-sm font-black text-blue-400 tabular-nums">{u.usageToday || 0} / {u.dailyCap || 5}</span>
                                      </div>
                                      <div className="flex justify-between items-center group/stat">
                                        <span className="text-[10px] text-slate-500 font-bold">JOINED</span>
                                        <span className="text-xs font-medium text-slate-400">
                                          {u.createdAt ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : '—'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
               </div>
              </div>
            </div>
      )}

      {activeTab === 'platforms' && (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <div className="mb-6">
            <h2 className="text-lg font-black text-slate-100">Search Platforms</h2>
            <p className="text-sm text-slate-400 mt-1">Choose which platforms FlipOps searches by default in Discovery</p>
          </div>

          {platformToast && (
            <div className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 animate-fade-in">
              {platformToast}
            </div>
          )}

          <div className="space-y-3">
            {PLATFORMS.map(p => {
              const enabled = platformPrefs[p.key] !== false
              return (
                <div key={p.key} className="card p-5 border-slate-700/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{p.emoji}</span>
                    <div>
                      <div className="font-bold text-slate-100 text-sm flex items-center gap-2">
                        {p.label}
                        {p.note && <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{p.note}</span>}
                      </div>
                      <div className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${enabled ? 'text-emerald-500' : 'text-slate-600'}`}>
                        {enabled ? 'Active' : 'Disabled'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePlatformToggle(p.key)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-slate-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'variants' && (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <div className="mb-6">
            <h2 className="text-lg font-black text-slate-100">Search Keyword Variants</h2>
            <p className="text-sm text-slate-400 mt-1">Define what FlipOps searches when you type a broad keyword in Discovery</p>
          </div>

          {kwLoading ? (
            <div className="flex justify-center py-12"><span className="spinner w-6 h-6 border-2 border-slate-700 border-t-blue-500" /></div>
          ) : (
            <>
              {kwVariants.map(v => (
                <div key={v.id} className="card p-5 border-slate-700/30">
                  {kwEditingId === v.id ? (
                    <div className="space-y-4">
                      <input
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                        value={kwDraft.trigger}
                        onChange={e => setKwDraft(prev => ({ ...prev, trigger: e.target.value }))}
                        placeholder="Trigger keyword"
                      />
                      <div className="flex flex-wrap gap-2">
                        {kwDraft.variants.map((chip, i) => (
                          kwEditChip.idx === i ? (
                            <input key={i} autoFocus
                              className="bg-slate-700 border border-blue-500 rounded-full px-3 py-1 text-xs text-slate-100 focus:outline-none w-32"
                              value={kwEditChip.val}
                              onChange={e => setKwEditChip(prev => ({ ...prev, val: e.target.value }))}
                              onBlur={() => {
                                if (kwEditChip.val.trim()) {
                                  const next = [...kwDraft.variants]; next[i] = kwEditChip.val.trim()
                                  setKwDraft(prev => ({ ...prev, variants: next }))
                                }
                                setKwEditChip({ idx: null, val: '' })
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setKwEditChip({ idx: null, val: '' }) }}
                            />
                          ) : (
                            <span key={i} onClick={() => setKwEditChip({ idx: i, val: chip })}
                              className="flex items-center gap-1 bg-slate-700 text-slate-200 text-xs rounded-full px-3 py-1 cursor-pointer hover:bg-slate-600">
                              {chip}
                              <button onClick={e => { e.stopPropagation(); setKwDraft(prev => ({ ...prev, variants: prev.variants.filter((_, j) => j !== i) })) }}
                                className="text-slate-500 hover:text-red-400 ml-0.5">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          )
                        ))}
                        <input
                          className="bg-slate-800 border border-dashed border-slate-600 rounded-full px-3 py-1 text-xs text-slate-400 focus:outline-none focus:border-blue-500 w-28"
                          placeholder="+ add chip"
                          value={kwNewChip}
                          onChange={e => setKwNewChip(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && kwNewChip.trim()) { setKwDraft(prev => ({ ...prev, variants: [...prev.variants, kwNewChip.trim()] })); setKwNewChip('') } }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleKwEditSave} className="btn-primary text-xs px-4 py-2">Save</button>
                        <button onClick={() => setKwEditingId(null)} className="btn-secondary text-xs px-4 py-2">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-black text-slate-100">{v.trigger}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleKwToggle(v)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${v.enabled ? 'bg-blue-500' : 'bg-slate-700'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${v.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                          <button onClick={() => { setKwEditingId(v.id); setKwDraft({ trigger: v.trigger, variants: [...v.variants] }); setKwNewChip('') }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleKwDelete(v.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {v.variants.map((chip, i) => (
                          <span key={i} className="bg-slate-800 text-slate-400 text-xs rounded-full px-3 py-1 border border-slate-700/50">{chip}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                        <span className={`px-2 py-0.5 rounded ${v.source === 'ai' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'}`}>
                          {v.source === 'ai' ? 'AI' : 'User'}
                        </span>
                        {v.lastEditedAt && <span>Edited {new Date(v.lastEditedAt).toLocaleDateString()}</span>}
                      </div>
                    </>
                  )}
                </div>
              ))}

              {kwAddingNew ? (
                <div className="card p-5 border-blue-500/20 space-y-4">
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    placeholder="Trigger keyword (e.g. 'Consola')"
                    value={kwNewForm.trigger}
                    onChange={e => setKwNewForm(prev => ({ ...prev, trigger: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    {kwNewForm.variants.map((chip, i) => (
                      <span key={i} className="flex items-center gap-1 bg-slate-700 text-slate-200 text-xs rounded-full px-3 py-1">
                        {chip}
                        <button onClick={() => setKwNewForm(prev => ({ ...prev, variants: prev.variants.filter((_, j) => j !== i) }))}
                          className="text-slate-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    <input
                      className="bg-slate-800 border border-dashed border-slate-600 rounded-full px-3 py-1 text-xs text-slate-400 focus:outline-none focus:border-blue-500 w-28"
                      placeholder="+ add chip"
                      value={kwNewChipInput}
                      onChange={e => setKwNewChipInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && kwNewChipInput.trim()) { setKwNewForm(prev => ({ ...prev, variants: [...prev.variants, kwNewChipInput.trim()] })); setKwNewChipInput('') } }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleKwCreate} disabled={!kwNewForm.trigger.trim() || kwNewForm.variants.length === 0}
                      className="btn-primary text-xs px-4 py-2 disabled:opacity-50">Save</button>
                    <button onClick={() => { setKwAddingNew(false); setKwNewForm({ trigger: '', variants: [] }); setKwNewChipInput('') }}
                      className="btn-secondary text-xs px-4 py-2">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setKwAddingNew(true)}
                  className="w-full py-4 rounded-2xl border border-dashed border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-all text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Add keyword group
                </button>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'providers' && (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-100">{t('settings.searchProviders.title')}</h2>
            <p className="text-sm text-slate-400 mt-1">{t('settings.searchProviders.subtitle')}</p>
          </div>

          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-2 ${
            userProfile?.usingPersonalSearch
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {userProfile?.usingPersonalSearch
              ? <>🟢 {t('settings.searchProviders.usingPersonal')} {userProfile.activeSearchProviders?.join(', ')}</>
              : <>🟡 {t('settings.searchProviders.usingShared')}</>}
          </div>

          <div className="space-y-4">
            {Object.entries(PROVIDER_INFO).map(([p, prov]) => {
              const state = providerStates[p] || {}
              const hasKey = state.hasKey && !changingKey[p]
              const u = searchUsage[p] || {}
              const pct = u.freeSearches > 0 ? Math.round((u.searchesRemaining / u.freeSearches) * 100) : 0
              const barColor = pct > 30 ? 'bg-green-500' : pct > 10 ? 'bg-yellow-500' : 'bg-red-500'
              return (
                <div key={p} className="card p-5 border-slate-700/30">
                  {hasKey ? (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{prov.emoji}</span>
                          <span className="font-bold text-slate-100 text-sm">{prov.name}</span>
                        </div>
                        <button
                          onClick={() => handleToggle(p, !state.enabled)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${state.enabled ? 'bg-blue-500' : 'bg-slate-700'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${state.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      <div className="space-y-1 mb-4">
                        <div className="text-xs text-slate-400">Key: <span className="font-mono">••••••••••</span></div>
                        {state.addedAt && <div className="text-xs text-slate-500">{t('settings.searchProviders.added')}: {new Date(state.addedAt).toLocaleDateString()}</div>}
                        <div className="text-xs text-slate-500">{t('settings.searchProviders.lastUsed')}: {state.lastUsedAt ? new Date(state.lastUsedAt).toLocaleDateString() : t('settings.searchProviders.never')}</div>
                      </div>
                      {u.freeSearches > 0 && (
                        <div className="mb-4 p-3 bg-slate-800/50 rounded-lg space-y-2">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>{t('settings.searchProviders.remaining', { count: u.searchesRemaining ?? '…' })}</span>
                            <span className="text-slate-500">{u.freeSearches} {t('settings.searchProviders.total')}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          {u.nextResetDate && (
                            <div className="text-[10px] text-slate-500">{t('settings.searchProviders.resetsOn')}: {new Date(u.nextResetDate).toLocaleDateString()}</div>
                          )}
                          {!u.nextResetDate && (
                            <div className="text-[10px] text-slate-500">{t('settings.searchProviders.neverResets')}</div>
                          )}
                          {u.lowCredits && (
                            <div className="text-[10px] text-red-400 flex items-center gap-1">
                              <span>⚠️</span>
                              <span>{t('settings.searchProviders.lowCredits')} — <button className="underline" onClick={() => window.open(prov.url, '_blank', 'noopener')}>{t('settings.searchProviders.topUp')}</button></span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button className="btn btn-ghost text-xs" onClick={() => setChangingKey(prev => ({ ...prev, [p]: true }))}>
                          {t('settings.searchProviders.changeKey')}
                        </button>
                        <button className="btn btn-danger text-xs" onClick={() => handleRemove(p)}>
                          {t('settings.searchProviders.removeKey')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">{prov.emoji}</span>
                        <span className="font-bold text-slate-100 text-sm">{prov.name}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{prov.freeInfo}</span>
                      </div>
                      {prov.closed ? (
                        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                          {t('settings.searchProviders.registrationClosed')}
                        </div>
                      ) : (
                        <>
                          <ol className="text-xs text-slate-400 space-y-1 mb-3 list-decimal list-inside">
                            {prov.steps.map((s, i) => <li key={i}>{s}</li>)}
                          </ol>
                          <button className="btn btn-ghost text-xs mb-3" onClick={() => window.open(prov.url, '_blank', 'noopener')}>
                            {t('settings.searchProviders.openProvider', { name: prov.name })}
                          </button>
                        </>
                      )}
                      <div className="flex gap-2 mt-1">
                        <input
                          type={showKey[p] ? 'text' : 'password'}
                          className="input flex-1 text-sm"
                          placeholder="Paste your API key"
                          value={keyInputs[p] || ''}
                          onChange={e => setKeyInputs(prev => ({ ...prev, [p]: e.target.value }))}
                        />
                        <button className="btn btn-ghost text-xs px-3" onClick={() => setShowKey(prev => ({ ...prev, [p]: !prev[p] }))}>
                          {showKey[p] ? t('settings.searchProviders.hideKey') : t('settings.searchProviders.showKey')}
                        </button>
                      </div>
                      {keyErrors[p] && <p className="text-red-500 text-xs mt-1">{keyErrors[p]}</p>}
                      <button
                        className="btn-primary text-xs mt-3 w-full justify-center py-2"
                        disabled={verifying[p] || !keyInputs[p]?.length}
                        onClick={handleSaveKey(p)}
                      >
                        {verifying[p] ? <span className="spinner w-3 h-3 mr-1" /> : null}
                        {verifying[p] ? 'Verifying…' : t('settings.searchProviders.saveAndVerify')}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-500">{t('settings.searchProviders.howItWorks')}</summary>
            <p className="text-sm mt-2 text-slate-400">{t('settings.searchProviders.howItWorksBody')}</p>
          </details>
        </div>
      )}

      {activeTab === 'master' && isAdmin && (
        <div className="max-w-xl mx-auto animate-in slide-in-from-right-4 duration-300">
          <div className="card p-8 border-amber-500/20 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity -mr-4 -mt-4">
                 <Key className="w-32 h-32 text-amber-500 rotate-12" />
              </div>
              <h3 className="text-lg font-black text-slate-100 mb-2 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-inner">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                Master Shared Key
              </h3>
              <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                This central key drives the AI for all users with <strong>Shared Access</strong> enabled. Keep it secure.
              </p>

              <form onSubmit={handleSetSharedKey} className="space-y-6">
                <div className="relative">
                  <input 
                    type="password"
                    className="w-full bg-surface-900 border border-slate-700 rounded-2xl px-5 py-4 text-sm font-mono tracking-widest text-emerald-400 focus:ring-2 ring-emerald-500/30"
                    placeholder="sk-ant-..."
                    value={sharedKey}
                    onChange={e => setSharedKey(e.target.value)}
                    disabled={updating}
                  />
                </div>
                <button 
                  type="submit" 
                  className="w-full btn-primary justify-center py-4 rounded-2xl shadow-xl shadow-emerald-500/10 active:scale-[0.98] transition-transform"
                  disabled={updating || !sharedKey.trim()}
                >
                  {updating ? <span className="spinner w-5 h-5" /> : 'Apply Infrastructure Update'}
                </button>
              </form>

              <div className="mt-12 pt-8 border-t border-slate-800 grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">Status</div>
                  <div className="text-xs font-bold text-emerald-500">OPERATIONAL</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">Rotation</div>
                  <div className="text-xs font-bold text-amber-500">MANUAL</div>
                </div>
              </div>
            </div>
          </div>
      )}

      {activeTab === 'appsettings' && isAdmin && (
        <div>
          <div className="section-header mb-2">
            <h2 className="text-xl font-black text-slate-100">App Settings</h2>
            <p className="text-sm text-slate-400 mt-1">Configure app behavior without redeploying</p>
          </div>
          <p className="text-xs text-slate-500 mb-6 italic">Changes take effect within 60 seconds (cache refresh interval)</p>

          {appConfigLoading && <div className="flex justify-center py-12"><span className="spinner w-8 h-8" /></div>}

          {appConfig && (
            <div className="space-y-4">

              {/* Discovery */}
              <div className="card p-0 overflow-hidden">
                <button className="w-full flex items-center justify-between p-5 text-left" onClick={() => setAppOpenSections(s => ({ ...s, discovery: !s.discovery }))}>
                  <span className="text-sm font-bold text-slate-100">Discovery</span>
                  {appOpenSections.discovery ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>
                {appOpenSections.discovery && (
                  <div className="px-5 pb-5 border-t border-slate-800 pt-4 space-y-3">
                    {[
                      { key: 'maxVariants', label: 'Max variants', min: 1, max: 10 },
                      { key: 'maxPlatforms', label: 'Max platforms', min: 1, max: 4 },
                      { key: 'timeBudget', label: 'Time budget (seconds)', min: 10, max: 120 },
                      { key: 'maxUrlsToEnrich', label: 'Max URLs to enrich', min: 1, max: 20 },
                      { key: 'freshnessDays', label: 'Freshness filter (days)', min: 1, max: 90 },
                      { key: 'minResultsBeforeFallback', label: 'Min results before fallback', min: 1, max: 10 },
                    ].map(({ key, label, min, max }) => (
                      <div key={key} className="flex items-center justify-between gap-4">
                        <label className="label text-xs">{label}</label>
                        <input type="number" min={min} max={max}
                          value={appConfig.discovery[key] ?? ''}
                          onChange={e => setAppConfig(c => ({ ...c, discovery: { ...c.discovery, [key]: Number(e.target.value) } }))}
                          className="input w-24 text-right" />
                      </div>
                    ))}
                    <button className="btn btn-primary w-full mt-1" onClick={() => handleSaveAppConfig('discovery')} disabled={appConfigSaving === 'discovery'}>
                      {appConfigSaving === 'discovery' ? <span className="spinner w-4 h-4" /> : appConfigSuccess === 'discovery' ? '✓ Saved' : 'Save section'}
                    </button>
                  </div>
                )}
              </div>

              {/* Providers */}
              <div className="card p-0 overflow-hidden">
                <button className="w-full flex items-center justify-between p-5 text-left" onClick={() => setAppOpenSections(s => ({ ...s, providers: !s.providers }))}>
                  <span className="text-sm font-bold text-slate-100">Providers</span>
                  {appOpenSections.providers ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>
                {appOpenSections.providers && (
                  <div className="px-5 pb-5 border-t border-slate-800 pt-4 space-y-3">
                    <div>
                      <div className="label text-xs mb-2">Priority order</div>
                      <div className="flex gap-2 flex-wrap">
                        {(appConfig.providers.priorityOrder || []).map((p, i, arr) => (
                          <div key={p} className="flex items-center gap-1 bg-slate-800 rounded-lg px-3 py-1.5">
                            <span className="text-xs font-bold text-slate-300">{p}</span>
                            <button className="text-slate-500 hover:text-slate-200 disabled:opacity-30 ml-1" disabled={i === 0}
                              onClick={() => { const a = [...arr]; [a[i-1], a[i]] = [a[i], a[i-1]]; setAppConfig(c => ({ ...c, providers: { ...c.providers, priorityOrder: a } })) }}>←</button>
                            <button className="text-slate-500 hover:text-slate-200 disabled:opacity-30" disabled={i === arr.length - 1}
                              onClick={() => { const a = [...arr]; [a[i], a[i+1]] = [a[i+1], a[i]]; setAppConfig(c => ({ ...c, providers: { ...c.providers, priorityOrder: a } })) }}>→</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    {[
                      { key: 'serperEnabled', label: 'Serper enabled' },
                      { key: 'serpApiEnabled', label: 'SerpAPI enabled' },
                      { key: 'scrapingdogEnabled', label: 'Scrapingdog enabled' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="label text-xs">{label}</span>
                        <button onClick={() => setAppConfig(c => ({ ...c, providers: { ...c.providers, [key]: !c.providers[key] } }))}
                          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${appConfig.providers[key] ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${appConfig.providers[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    ))}
                    <button className="btn btn-primary w-full mt-1" onClick={() => handleSaveAppConfig('providers')} disabled={appConfigSaving === 'providers'}>
                      {appConfigSaving === 'providers' ? <span className="spinner w-4 h-4" /> : appConfigSuccess === 'providers' ? '✓ Saved' : 'Save section'}
                    </button>
                  </div>
                )}
              </div>

              {/* AI */}
              <div className="card p-0 overflow-hidden">
                <button className="w-full flex items-center justify-between p-5 text-left" onClick={() => setAppOpenSections(s => ({ ...s, ai: !s.ai }))}>
                  <span className="text-sm font-bold text-slate-100">AI</span>
                  {appOpenSections.ai ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>
                {appOpenSections.ai && (
                  <div className="px-5 pb-5 border-t border-slate-800 pt-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <label className="label text-xs">Model</label>
                      <select value={appConfig.ai.model} onChange={e => setAppConfig(c => ({ ...c, ai: { ...c.ai, model: e.target.value } }))} className="input w-auto text-xs">
                        <option value="claude-haiku-4-5-20251001">Haiku (cheapest)</option>
                        <option value="claude-sonnet-4-20250514">Sonnet (balanced)</option>
                        <option value="claude-opus-4-5">Opus (most capable)</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <label className="label text-xs">Max tokens</label>
                      <input type="number" min={500} max={4000} value={appConfig.ai.maxTokens ?? ''}
                        onChange={e => setAppConfig(c => ({ ...c, ai: { ...c.ai, maxTokens: Number(e.target.value) } }))} className="input w-24 text-right" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-4">
                        <label className="label text-xs">Min score to show</label>
                        <input type="number" min={0} max={100} value={appConfig.ai.minScoreToShow ?? ''}
                          onChange={e => setAppConfig(c => ({ ...c, ai: { ...c.ai, minScoreToShow: Number(e.target.value) } }))} className="input w-24 text-right" />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Results below this score are hidden</p>
                    </div>
                    <button className="btn btn-primary w-full mt-1" onClick={() => handleSaveAppConfig('ai')} disabled={appConfigSaving === 'ai'}>
                      {appConfigSaving === 'ai' ? <span className="spinner w-4 h-4" /> : appConfigSuccess === 'ai' ? '✓ Saved' : 'Save section'}
                    </button>
                  </div>
                )}
              </div>

              {/* Negotiation defaults */}
              <div className="card p-0 overflow-hidden">
                <button className="w-full flex items-center justify-between p-5 text-left" onClick={() => setAppOpenSections(s => ({ ...s, negotiation: !s.negotiation }))}>
                  <span className="text-sm font-bold text-slate-100">Negotiation defaults</span>
                  {appOpenSections.negotiation ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>
                {appOpenSections.negotiation && (
                  <div className="px-5 pb-5 border-t border-slate-800 pt-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <label className="label text-xs">Target margin %</label>
                      <input type="number" value={appConfig.negotiation.targetMarginPct ?? ''}
                        onChange={e => setAppConfig(c => ({ ...c, negotiation: { ...c.negotiation, targetMarginPct: Number(e.target.value) } }))} className="input w-24 text-right" />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <label className="label text-xs">Platform fee %</label>
                      <input type="number" value={appConfig.negotiation.platformFeePct ?? ''}
                        onChange={e => setAppConfig(c => ({ ...c, negotiation: { ...c.negotiation, platformFeePct: Number(e.target.value) } }))} className="input w-24 text-right" />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <label className="label text-xs">Default tone</label>
                      <select value={appConfig.negotiation.defaultTone} onChange={e => setAppConfig(c => ({ ...c, negotiation: { ...c.negotiation, defaultTone: e.target.value } }))} className="input w-auto text-xs">
                        <option value="friendly">Friendly</option>
                        <option value="firm">Firm</option>
                        <option value="curious">Curious</option>
                      </select>
                    </div>
                    <button className="btn btn-primary w-full mt-1" onClick={() => handleSaveAppConfig('negotiation')} disabled={appConfigSaving === 'negotiation'}>
                      {appConfigSaving === 'negotiation' ? <span className="spinner w-4 h-4" /> : appConfigSuccess === 'negotiation' ? '✓ Saved' : 'Save section'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}
    </main>
  </div>
</div>
  )
}

function UsageChart({ history }) {
  const [period, setPeriod] = useState('7D')
  const labels = []
  const data = []
  
  if (period === '1D') {
    // Show today and yesterday
    for (let i = 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      labels.push(i === 0 ? 'Today' : 'Yesterday')
      data.push(history[dateStr] || 0)
    }
  } else if (period === '7D') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }))
      data.push(history[dateStr] || 0)
    }
  } else if (period === '1M') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      labels.push(i % 5 === 0 ? d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '')
      data.push(history[dateStr] || 0)
    }
  } else if (period === '1Y') {
    // Aggregate by month
    const monthlyData = {}
    for (let i = 365; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      if (!monthlyData[monthStr]) monthlyData[monthStr] = 0
      monthlyData[monthStr] += (history[dateStr] || 0)
    }
    for (const [m, count] of Object.entries(monthlyData)) {
      labels.push(m)
      data.push(count)
    }
  }

  const chartData = {
    labels,
    datasets: [
      {
        fill: true,
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        tension: 0.5,
        pointRadius: period === '1M' || period === '1Y' ? 0 : 3,
        pointHoverRadius: 6,
        borderWidth: period === '1M' || period === '1Y' ? 2 : 3,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        padding: 12,
        titleFont: { size: 10, weight: 'bold' },
        bodyFont: { size: 14, weight: 'black' },
        cornerRadius: 12,
        displayColors: false,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { 
          stepSize: period === '1D' ? 1 : undefined, 
          color: '#475569',
          font: { size: 9, weight: 'bold' }
        },
        grid: { color: 'rgba(255, 255, 255, 0.03)' }
      },
      x: {
        ticks: { 
          color: '#475569',
          font: { size: 9, weight: 'bold' },
          maxRotation: 0
        },
        grid: { display: false }
      }
    }
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
          <BarChart className="w-3 h-3 text-blue-500/50" /> Consumption
        </h4>
        <div className="flex bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50">
          {['1D', '7D', '1M', '1Y'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-[9px] font-black px-2.5 py-1 rounded transition-colors ${
                period === p ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="relative w-full h-24 md:h-44 min-w-0">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}
