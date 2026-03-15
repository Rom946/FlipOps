import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Users, Activity, ShieldCheck, Key, Save, Search, UserCog,
  TrendingUp, ChevronDown, ChevronUp, BarChart, Trash2, CheckCircle, AlertCircle,
  Settings as SettingsIcon, Shield, MessageSquare, MapPin, Globe, Plus, Trash2 as Trash,
  Home, Briefcase, Navigation, Calendar, Zap as ZapIcon, Sparkles, History, Bot, MessageCircle
} from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
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

const DEFAULT_NEGOTIATION_PROMPT = 'Be professional and friendly. Always propose round prices (ending in 0 or 5). If the deal score is above 85, show extra enthusiasm in the negotiation message. Keep messages short and natural — avoid sounding like a bot.'
const DEFAULT_LISTING_PROMPT = 'Highlight the best value-for-money aspect. Mention flexibility on price and fast response. Keep it conversational — avoid generic copy-paste listing language.'
const DEFAULT_BATCH_PROMPT = 'Focus on products with the best resale margin. Be strict about filtering accessories and bundles. Flag any sellers with suspicious behaviour or vague descriptions.'
const DEFAULT_DISCUSSION_PROMPT = 'Keep replies short and natural — 2-3 sentences max. Prioritize building trust before making offers. Always suggest a round price. If the conversation is stalling, create mild urgency without being pushy.'

export default function AdminDashboard({ pipeline }) {
  const api = useApi()
  const { isAdmin } = useAuth()
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


  const navItems = [
    { id: 'profile', label: 'Profile & Security', icon: Key },
    { id: 'locations', label: 'My Locations', icon: MapPin },
    { id: 'ai', label: 'AI Customization', icon: Sparkles },
    ...(isAdmin ? [
      { id: 'stats', label: 'System Health', icon: Activity },
      { id: 'users', label: 'User Controls', icon: UserCog },
      { id: 'master', label: 'Infrastructure', icon: ShieldCheck }
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
