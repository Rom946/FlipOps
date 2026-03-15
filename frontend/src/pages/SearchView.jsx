import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  Download, Plus, Edit3, MapPin, User, AlertCircle, Navigation,
  Image as ImageIcon, RefreshCw, Copy, Check, ExternalLink,
  Sparkles, Clock, Truck, BarChart2, Calendar, ChevronDown, ChevronUp,
  Tag, Info, TrendingUp, Award, Zap, ChevronLeft
} from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useTranslation } from 'react-i18next'

export default function SearchView({ pipeline }) {
  const navigate = useNavigate()
  const location = useLocation()
  const api = useApi()
  const { t } = useTranslation()

  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [listing, setListing] = useState(null)
  const [analysis, setAnalysis] = useState(null) // Unified AI Analysis
  const [profile, setProfile] = useState(null)
  const [showManual, setShowManual] = useState(false)
  const [isDescExpanded, setIsDescExpanded] = useState(false)
  const [history, setHistory] = useState([])

  const [manualForm, setManualForm] = useState({
    title: '',
    price: '',
    description: '',
  })

  const [negotiation, setNegotiation] = useState({
    maxBuy: '',
    tone: 'friendly',
    loading: false
  })
  const [negTab, setNegTab] = useState('opener')

  const [copySuccess, setCopySuccess] = useState(false)

  useEffect(() => {
    fetchProfile()
    fetchHistory()
  }, [])

  // Auto-trigger analysis when navigated here with a URL (e.g. from Recent Activity click)
  useEffect(() => {
    if (location.state?.autoUrl) {
      runAnalysis(location.state.autoUrl)
      window.history.replaceState({}, '') // clear state so refresh doesn't re-trigger
    }
  }, [location.state])

  const fetchHistory = async () => {
    try {
      const data = await api.getHistory()
      setHistory(data)
    } catch (err) {
      console.error('Failed to fetch history:', err)
    }
  }

  const saveToHistory = async (l, score, action = 'Discarded') => {
    try {
      const titleText = typeof l.title === 'object' ? (l.title.original || l.title.translated) : l.title
      await api.saveHistory({
        item_id: l.item_id,
        title: titleText,
        price: l.price,
        score: score,
        action: action,
        images: l.images,
        url: l.url
      })
      fetchHistory() // Refresh list
    } catch (err) {
      console.error('Failed to save history:', err)
    }
  }

  const fetchProfile = async () => {
    try {
      const data = await api.getMe()
      setProfile(data)
    } catch (err) {
      console.error('Failed to fetch profile:', err)
    }
  }

  const runAnalysis = async (targetUrl) => {
    if (!targetUrl?.trim()) return
    setUrl(targetUrl)
    setLoading(true)
    setError('')
    setListing(null)
    setAnalysis(null)
    setShowManual(false)
    setIsDescExpanded(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    try {
      const data = await api.importListing(targetUrl)
      setListing(data)

      const initialMaxBuy = Math.round(Number(data.price) * 0.70)
      setNegotiation({ maxBuy: initialMaxBuy, tone: 'friendly', loading: true })

      try {
        const titleText = typeof data.title === 'object' ? (data.title.original || data.title.translated) : data.title
        const descText = typeof data.description === 'object' ? (data.description.original || data.description.translated) : data.description

        const analysisData = await api.analyzeListing({
          product: titleText,
          listed_price: data.price,
          target_price: initialMaxBuy,
          tone: profile?.default_tone || 'friendly',
          preferred_language: profile?.preferred_language || 'en',
          negotiation_language: profile?.negotiation_language || 'es',
          description: descText,
          condition: data.condition
        })
        setAnalysis(analysisData)
        saveToHistory(data, analysisData?.flip_analysis?.deal_score || 0, 'Discarded')
      } catch (negErr) {
        console.error("Analysis failed:", negErr)
      } finally {
        setNegotiation(prev => ({ ...prev, loading: false }))
      }
    } catch (err) {
      setError(err.message || 'Failed to import listing.')
      setShowManual(true)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = (e) => {
    e.preventDefault()
    runAnalysis(url)
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    const newListing = {
      title: manualForm.title,
      price: manualForm.price,
      description: manualForm.description,
      images: [],
      url: url,
      seller: 'Manual Entry',
      location: 'Unknown',
      item_id: 'manual-' + Date.now()
    }
    setListing(newListing)
    setShowManual(false)

    // Trigger unified analysis for manual
    const initialMaxBuy = Math.round(Number(newListing.price) * 0.70)
    setNegotiation({ maxBuy: initialMaxBuy, tone: profile?.default_tone || 'friendly', loading: true })
    handleRegenerate(newListing, initialMaxBuy, profile?.default_tone || 'friendly')
  }

  const handleRegenerate = async (l = listing, mb = negotiation.maxBuy, tone = negotiation.tone) => {
    if (!l) return
    setNegotiation(prev => ({ ...prev, loading: true }))
    try {
      const titleText = typeof l.title === 'object' ? (l.title.original || l.title.translated) : l.title
      const descText = typeof l.description === 'object' ? (l.description.original || l.description.translated) : l.description

      const analysisData = await api.analyzeListing({
        product: titleText,
        listed_price: l.price,
        target_price: mb,
        tone: tone,
        preferred_language: profile?.preferred_language || 'en',
        negotiation_language: profile?.negotiation_language || 'es',
        description: descText,
        condition: l.condition || 'Buen estado'
      })
      setAnalysis(analysisData)
    } catch (err) {
      setError(err.message)
    } finally {
      setNegotiation(prev => ({ ...prev, loading: false }))
    }
  }

  const handleAddToPipeline = (forceStatus = 'Watching', finalBuyPrice = null) => {
    if (!listing) return
    const titleText = typeof listing.title === 'object' ? (listing.title.original || listing.title.translated) : listing.title

    pipeline.addDeal({
      product: titleText,
      initial_price: listing.price,
      target_buy: negotiation.maxBuy,
      actual_buy: listing.price, // Default to listed price until negotiated
      target_sell: analysis?.market_data?.avg_second_hand_price || Math.round(Number(negotiation.maxBuy || listing.price) * 1.35),
      url: listing.url,
      slug: listing.item_id || 'manual',
      status: forceStatus,
      chat_history: analysis?.negotiation?.opener ? `Me: ${analysis.negotiation.opener}` : '',
      analysis: analysis || null,
      seller: listing.seller && typeof listing.seller === 'object' ? {
        name: listing.seller.name,
        type: listing.seller.type,
        score_raw: listing.seller.score_raw,
        scoring: listing.seller.scoring,
        rating: listing.seller.rating,
        web_slug: listing.seller.web_slug,
      } : null,
    })
    saveToHistory(listing, analysis?.flip_analysis?.deal_score || 0, 'Saved to Pipeline')
    navigate('/pipeline')
  }


  // Haversine distance helper for frontend
  const getDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null
    const R = 6371 // km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return Math.round(R * c * 10) / 10
  }

  // Helper for relative time
  const timeSince = (timestamp) => {
    if (!timestamp) return null
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000)
    let interval = Math.floor(seconds / 31536000)
    if (interval > 1) return `hace ${interval} años`
    interval = Math.floor(seconds / 2592000)
    if (interval > 1) return `hace ${interval} meses`
    interval = Math.floor(seconds / 86400)
    if (interval > 1) return `hace ${interval} días`
    interval = Math.floor(seconds / 3600)
    if (interval > 1) return `hace ${interval} horas`
    interval = Math.floor(seconds / 60)
    if (interval > 1) return `hace ${interval} minutos`
    return 'hace poco'
  }

  return (
    <div className="page-container max-w-7xl mx-auto px-4">
      {/* API Key Banner - shown ABOVE header only when key is truly missing */}
      {profile !== null && !profile?.api_key_masked && !profile?.hasSharedAccess && (
        <div className="mb-6 card p-4 bg-gradient-to-r from-indigo-900/40 to-slate-900 border-indigo-500/30 flex items-center justify-between">
          <div className="flex gap-4 items-center">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">{t('search.connect_key')}</h3>
              <p className="text-xs text-slate-400">{t('search.connect_key_desc')}</p>
            </div>
          </div>
          <Link to="/management" className="btn-primary text-sm py-2">{t('search.connect_key_btn')}</Link>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          {location.state?.discoveryState && (
            <button
              onClick={() => navigate('/discovery', { state: { restoredState: location.state.discoveryState } })}
              className="mb-4 text-xs font-bold text-slate-400 hover:text-blue-400 flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Discovery
            </button>
          )}
          <h1 className="section-header mb-2">
            <Download className="w-6 h-6 text-blue-400" />
            <span>{t('search.header')}</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-md">{t('search.subtitle')}</p>
        </div>

        {/* URL Import Form - Compact in header when listing is present */}
        <form onSubmit={handleImport} className={`flex gap-3 ${listing ? 'max-w-md w-full' : 'w-full max-w-2xl'}`}>
          <div className="relative flex-1">
            <input
              className="input w-full pl-10"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('search.placeholder')}
              required
            />
            <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner" /> : <TrendingUp className="w-4 h-4" />}
            {loading ? t('search.analyzing') : t('search.analyze')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/discovery', { state: { initialUrl: url } })}
            className="btn-secondary border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/10 px-3 flex items-center justify-center transition-all"
            title="Open in Bulk Discovery"
          >
            <Zap className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Error & Manual Fallback - Same as before but styled better */}
      {error && (
        <div className="mb-8 flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold text-sm">{t('search.import_error')}</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        </div>
      )}

      {showManual && (
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleManualSubmit} className="card p-6 mb-8 border-amber-500/30 animate-fade-in-up">
            <h2 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> {t('search.manual_fallback')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label">{t('search.manual_title')}</label>
                <input className="input" value={manualForm.title} onChange={e => setManualForm({...manualForm, title: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('search.manual_price')}</label>
                  <input className="input" type="number" value={manualForm.price} onChange={e => setManualForm({...manualForm, price: e.target.value})} required />
                </div>
                <div>
                  <label className="label">{t('search.manual_location')}</label>
                  <input className="input" placeholder="City" />
                </div>
              </div>
              <div>
                <label className="label">{t('search.manual_description')}</label>
                <textarea className="input min-h-[120px]" value={manualForm.description} onChange={e => setManualForm({...manualForm, description: e.target.value})} />
              </div>
              <button type="submit" className="btn-primary w-full justify-center py-3">{t('search.manual_submit')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Deal Summary Banner - shown when analysis is ready */}
      {listing && analysis && !negotiation.loading && (
        <div className="card p-4 mb-6 border-slate-700/50 bg-gradient-to-r from-slate-800/30 to-transparent animate-fade-in">
          {/* Row 1 — Hero metrics */}
          <div className="grid grid-cols-3 gap-4 pb-4 mb-4 border-b border-slate-700/40">
            {/* Deal Score */}
            <div className="text-center">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Deal Score</div>
              {analysis.flip_analysis?.deal_score ? (
                <div className={`text-2xl font-black ${
                  analysis.flip_analysis.deal_score > 80 ? 'text-emerald-400' :
                  analysis.flip_analysis.deal_score > 50 ? 'text-amber-400' : 'text-red-400'
                }`}>{analysis.flip_analysis.deal_score}<span className="text-slate-500 text-sm font-bold">/100</span></div>
              ) : <div className="text-slate-600 text-lg">—</div>}
            </div>

            {/* Verdict */}
            <div className="text-center flex flex-col items-center">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Verdict</div>
              {analysis.verdict ? (
                <div className={`text-sm font-black uppercase tracking-wide px-3 py-1 rounded-lg border ${
                  analysis.verdict === 'buy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                  analysis.verdict === 'negotiate' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                  'text-red-400 bg-red-500/10 border-red-500/30'
                }`}>{analysis.verdict}</div>
              ) : <div className="text-slate-600 text-lg">—</div>}
            </div>

            {/* Estimated Profit */}
            <div className="text-center">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Est. Profit</div>
              {analysis.flip_analysis?.estimated_profit != null ? (
                <>
                  <div className={`text-2xl font-black ${analysis.flip_analysis.estimated_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {analysis.flip_analysis.estimated_profit >= 0 ? '+' : ''}{analysis.flip_analysis.estimated_profit}€
                  </div>
                  {analysis.flip_analysis.real_margin_pct != null && (
                    <div className="text-[10px] text-slate-500">{analysis.flip_analysis.real_margin_pct.toFixed(1)}% margin</div>
                  )}
                </>
              ) : <div className="text-slate-600 text-lg">—</div>}
            </div>
          </div>

          {/* Row 2 — Secondary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-3">
            {/* Target Buy */}
            <div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Target Buy</div>
              <div className="text-base font-black text-blue-400">{negotiation.maxBuy || '—'}€</div>
              {Number(listing.price) - Number(negotiation.maxBuy) > 0 && (
                <div className="text-[10px] text-red-400/70">-{Number(listing.price) - Number(negotiation.maxBuy)}€ vs listed</div>
              )}
            </div>

            {/* Target Resell */}
            {analysis.market_data?.avg_second_hand_price && (
              <div>
                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Target Resell</div>
                <div className="text-base font-black text-emerald-400">{analysis.market_data.avg_second_hand_price}€</div>
                {negotiation.maxBuy && (
                  <div className="text-[10px] text-emerald-500/70">
                    +{Math.max(0, Number(analysis.market_data.avg_second_hand_price) - Number(negotiation.maxBuy))}€ spread
                  </div>
                )}
              </div>
            )}

            {/* Condition */}
            <div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Condition</div>
              <div className="text-sm font-bold text-slate-200">{listing.condition || '—'}</div>
            </div>

            {/* Flip Complexity */}
            <div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Complexity</div>
              {analysis.flip_analysis?.complexity ? (
                <div className={`text-sm font-black ${
                  analysis.flip_analysis.complexity === 'easy' ? 'text-emerald-400' :
                  analysis.flip_analysis.complexity === 'medium' ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {analysis.flip_analysis.complexity.charAt(0).toUpperCase() + analysis.flip_analysis.complexity.slice(1)}
                  {analysis.flip_analysis.needs_repair && (
                    <span className="ml-1.5 text-[10px] text-amber-400/80">
                      {analysis.flip_analysis.repair_estimate ? `⚠ ~${analysis.flip_analysis.repair_estimate}€` : '⚠ repair'}
                    </span>
                  )}
                </div>
              ) : <div className="text-slate-600 text-sm">—</div>}
            </div>

            {/* Time to Sell */}
            <div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Time to Sell</div>
              {analysis.flip_analysis?.time_to_sell_estimate ? (
                <div className={`text-sm font-black ${
                  analysis.flip_analysis.time_to_sell_estimate.startsWith('fast') ? 'text-emerald-400' :
                  analysis.flip_analysis.time_to_sell_estimate.startsWith('medium') ? 'text-amber-400' : 'text-slate-400'
                }`}>{analysis.flip_analysis.time_to_sell_estimate}</div>
              ) : <div className="text-slate-600 text-sm">—</div>}
            </div>

            {/* Price Trend */}
            <div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Price Trend</div>
              {analysis.market_data?.price_trend ? (
                <div className={`text-sm font-black ${
                  analysis.market_data.price_trend === 'dropping' ? 'text-red-400' :
                  analysis.market_data.price_trend === 'rising' ? 'text-emerald-400' : 'text-slate-400'
                }`}>
                  {analysis.market_data.price_trend === 'dropping' ? '↓ Dropping' :
                   analysis.market_data.price_trend === 'rising' ? '↑ Rising' : '→ Stable'}
                </div>
              ) : <div className="text-slate-600 text-sm">—</div>}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Action Buttons and Insights Hub (Shown below Summary Banner, hidden on Desktop) */}
      {listing && (
        <div className="flex lg:hidden flex-col gap-4 mb-6 animate-fade-in-up">
          {/* Pro Insight - Mobile */}
          <div className="card p-5 bg-blue-600/5 border-blue-500/20">
            <h4 className="text-xs font-bold text-blue-300 mb-2 flex items-center gap-2">
              <Info className="w-3 h-3" /> {t('search.pro_insight')}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed italic">
              {analysis?.flip_analysis?.reasoning || t('search.waiting_analysis')}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button onClick={() => handleAddToPipeline('Watching')} className="btn-primary w-full justify-center py-3 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/10">
              <Plus className="w-4 h-4" /> {t('search.save_pipeline')}
            </button>
            <button onClick={() => {
              saveToHistory(listing, analysis?.flip_analysis?.deal_score || 0, 'Generated Listing')
              navigate('/listing', { state: { listing } })
            }} className="btn-secondary w-full justify-center py-3 bg-emerald-600/10 text-emerald-400 border-emerald-600/20 hover:bg-emerald-600/20 shadow-lg shadow-emerald-500/5">
              <Edit3 className="w-4 h-4" /> {t('search.create_listing')}
            </button>
          </div>
        </div>
      )}

      {/* Main 3-Column Layout */}
      {listing && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in-up">

          {/* LEFT COLUMN: AI Analysis & Market Comparison */}
          <div className="lg:col-span-3 space-y-6 order-2 lg:order-1">
            {/* Pro Insight - Now at the Top (Hidden on Mobile, shown on Desktop) */}
            <div className="card p-5 bg-blue-600/5 border-blue-500/20 hidden lg:block">
              <h4 className="text-xs font-bold text-blue-300 mb-2 flex items-center gap-2">
                <Info className="w-3 h-3" /> {t('search.pro_insight')}
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed italic">
                {analysis?.flip_analysis?.reasoning || t('search.waiting_analysis')}
              </p>
            </div>

            {/* Market Intelligence */}
            <div className="card p-5 border-slate-700/50">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <BarChart2 className="w-3 h-3" /> {t('search.market_intel')}
              </h3>

              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-black mb-1">{t('search.brand_new')}</div>
                    <div className="text-xl font-bold text-slate-100 flex items-center gap-2">
                      {analysis?.market_data?.brand_new_price ? `${analysis.market_data.brand_new_price}€` : '--'}
                      <Tag className="w-4 h-4 text-emerald-500" />
                    </div>
                    {analysis?.market_data?.brand_new_source && (
                      <div className="text-[9px] text-slate-500 mt-0.5 break-words whitespace-normal italic">Source: {analysis.market_data.brand_new_source}</div>
                    )}
                  </div>
                  <div className="h-px bg-slate-800" />
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-black mb-1">
                      {t('search.avg_second_hand')} {(listing?.condition && listing.condition !== 'Desconocido') ? listing.condition : ''}
                    </div>
                    <div className="text-xl font-bold text-slate-100 flex items-center gap-2">
                      {analysis?.market_data?.avg_second_hand_price ? `${analysis.market_data.avg_second_hand_price}€` : '--'}
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                    </div>
                    {analysis?.market_data?.second_hand_source && (
                      <div className="text-[9px] text-slate-500 mt-0.5 break-words whitespace-normal italic">Source: {analysis.market_data.second_hand_source}</div>
                    )}
                  </div>
                  <div className="h-px bg-slate-800" />
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-black mb-1">{t('search.release_date')}</div>
                    <div className="text-xl font-bold text-slate-300 flex items-center gap-2">
                      {analysis?.market_data?.release_date || t('search.unknown')}
                      <Calendar className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Red Flags */}
            {analysis?.red_flags?.detected && (
              <div className="card p-5 border-red-500/20 bg-red-500/[0.03]">
                <h3 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  ⚠ Red Flags
                  <span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-black border ${
                    analysis.red_flags.risk_level === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                    analysis.red_flags.risk_level === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>{analysis.red_flags.risk_level} risk</span>
                </h3>
                <ul className="space-y-1.5">
                  {analysis.red_flags.flags?.map((flag, i) => (
                    <li key={i} className="text-xs text-red-300/80 flex items-start gap-2">
                      <span className="text-red-500 mt-0.5 shrink-0">•</span>{flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* MIDDLE COLUMN: Main Listing Content */}
          <div className="lg:col-span-6 space-y-6 order-1 lg:order-2">
            <div className="card overflow-hidden">
              {/* Image Gallery (Main) */}
              <div className="relative aspect-video bg-surface-900 overflow-hidden">
                {listing.images && listing.images.length > 0 ? (
                  <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-800/10">
                    <ImageIcon className="w-16 h-16" />
                  </div>
                )}
                <div className="absolute top-4 right-4 flex gap-2">
                   <div className="px-3 py-1.5 rounded-full bg-surface-900/80 backdrop-blur-md border border-white/5 text-lg font-black text-blue-400 shadow-xl">
                    {listing.price}€
                  </div>
                </div>
              </div>

              <div className="p-6">
                <h2 className="text-2xl font-bold text-white mb-3 leading-tight">
                {typeof listing.title === 'object' ? listing.title.original || listing.title.translated : listing.title}
              </h2>
              {listing.condition && listing.condition !== 'Desconocido' && (
                <div className="inline-flex items-center gap-1.5 mb-4 px-2.5 py-1 rounded-lg border text-xs font-bold
                  bg-slate-700/50 border-slate-600/50 text-slate-300">
                  <Tag className="w-3 h-3 text-slate-400" /> {listing.condition}
                </div>
              )}

                {/* Meta Row — flat pills, wrapping */}
                <div className="flex flex-wrap gap-2 mb-5 text-xs">
                  {/* Location */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 text-slate-300">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                    <span>{listing.location?.city || (typeof listing.location === 'string' ? listing.location : null) || 'Local'}</span>
                  </div>

                  {/* Distance pills */}
                  {profile?.locations?.map((loc, i) => {
                    const dist = getDistance(loc.lat, loc.lon, listing.location?.lat, listing.location?.lon)
                    if (dist === null) return null
                    return (
                      <div key={i} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/30 text-slate-500">
                        <Navigation className="w-2.5 h-2.5 shrink-0" />
                        <span><span className="font-bold text-slate-400">{dist} km</span> de {loc.label}</span>
                      </div>
                    )
                  })}

                  {/* Seller name + link */}
                  {listing.seller && typeof listing.seller === 'object' ? (
                    <a
                      href={`https://es.wallapop.com/user/${listing.seller?.web_slug || listing.seller?.id || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 text-slate-300 hover:text-blue-400 hover:bg-slate-700/50 transition-colors group"
                    >
                      <User className="w-3 h-3 text-blue-400 shrink-0" />
                      <span>{listing.seller.name || 'Unknown seller'}</span>
                      <ExternalLink className="w-2 h-2 opacity-0 group-hover:opacity-100 shrink-0" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 text-slate-500">
                      <User className="w-3 h-3 shrink-0" />
                      <span>{typeof listing.seller === 'string' ? listing.seller : 'Unknown seller'}</span>
                    </div>
                  )}

                  {/* Seller type badge — always shown when seller is object */}
                  {listing.seller && typeof listing.seller === 'object' && (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider ${
                      listing.seller.type === 'professional'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
                    }`}>
                      {listing.seller.type === 'professional' ? '🏢 Professional' : '👤 Individual'}
                    </div>
                  )}

                  {/* Seller rating — shown when seller is object */}
                  {listing.seller && typeof listing.seller === 'object' && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/30 text-slate-500">
                      <Award className="w-2.5 h-2.5 text-yellow-400 shrink-0" />
                      {listing.seller.score_raw ? (
                        <span className="font-bold text-yellow-400 text-xs">{listing.seller.score_raw}<span className="text-slate-600">/5</span></span>
                      ) : listing.seller.scoring > 0 ? (
                        <span className="font-bold text-yellow-400 text-xs">{(listing.seller.scoring / 20).toFixed(1)}<span className="text-slate-600">/5</span></span>
                      ) : (
                        <span className="text-slate-600 text-xs">No rating</span>
                      )}
                      {listing.seller.rating > 0 && (
                        <span className="text-xs text-slate-500">({listing.seller.rating} reviews)</span>
                      )}
                    </div>
                  )}

                  {/* Published date */}
                  {listing.published_date && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 text-slate-300">
                      <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>Publicado {timeSince(listing.published_date)}</span>
                    </div>
                  )}

                  {/* Modified date — only show if different from published */}
                  {listing.modified_date && listing.modified_date !== listing.published_date && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 text-slate-300">
                      <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                      <span>Editado {timeSince(listing.modified_date)}</span>
                    </div>
                  )}

                  {/* Shipping */}
                  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${listing.shipping_allowed ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700'}`}>
                    <Truck className="w-3 h-3 shrink-0" />
                    <span>{listing.shipping_allowed ? t('search.shipping_available') : t('search.in_person_only')}</span>
                  </div>

                  {/* Characteristics (e.g. "Como nuevo · Apple · iPhone 16 · 256 GB") */}
                  {listing.characteristics && (
                    <div className="w-full text-[10px] text-slate-500 mt-0.5 px-0.5 italic">
                      {listing.characteristics}
                    </div>
                  )}
                </div>

                {/* Expandable Description */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <span>{t('search.product_description')}</span>
                    <button
                      onClick={() => setIsDescExpanded(!isDescExpanded)}
                      className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                    >
                      {isDescExpanded ? t('search.see_less') : t('search.see_full')} {isDescExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className={`text-sm text-slate-400 leading-relaxed overflow-hidden transition-all duration-300 ${isDescExpanded ? 'max-h-[1000px]' : 'max-h-[72px] relative'}`}>
                    {typeof listing.description === 'object' ? listing.description.original || listing.description.translated : listing.description}
                    {!isDescExpanded && <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-surface-800 to-transparent" />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: AI Insights & Negotiation */}
          <div className="lg:col-span-3 space-y-6 order-3">
            <div className="card p-6 border-indigo-500/20 bg-indigo-500/5">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> {t('search.ai_hub')}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="label">{t('search.target_price')}</label>
                  <input
                    type="number"
                    className="input bg-surface-900"
                    value={negotiation.maxBuy}
                    onChange={e => setNegotiation(prev => ({ ...prev, maxBuy: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">{t('search.tone')}</label>
                  <select
                    className="input bg-surface-900"
                    value={negotiation.tone}
                    onChange={e => setNegotiation(prev => ({ ...prev, tone: e.target.value }))}
                  >
                    <option value="friendly">{t('common.tone.friendly')}</option>
                    <option value="firm">{t('common.tone.firm')}</option>
                    <option value="curious">{t('common.tone.curious')}</option>
                  </select>
                </div>
                <button
                  onClick={() => handleRegenerate()}
                  className="btn-secondary w-full justify-center py-2.5 bg-indigo-600/10 text-indigo-400 border-indigo-600/30 hover:bg-slate-700"
                  disabled={negotiation.loading}
                >
                  {negotiation.loading ? <span className="spinner" /> : <RefreshCw className="w-4 h-4" />}
                  {t('search.regenerate')}
                </button>
              </div>

              <div className="mt-6 relative">
                {negotiation.loading && (
                  <div className="absolute inset-0 bg-surface-900/60 flex items-center justify-center rounded-xl z-10 backdrop-blur-sm">
                    <span className="spinner w-8 h-8" />
                  </div>
                )}

                {/* Message tabs */}
                {analysis?.negotiation && (
                  <div className="flex gap-1 mb-3 bg-surface-950 p-1 rounded-xl border border-slate-800">
                    {[
                      { key: 'opener', label: 'Opener' },
                      { key: 'follow_up', label: 'Follow-up' },
                      { key: 'counter_response', label: 'Counter' },
                      { key: 'walk_away_line', label: 'Walk Away' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setNegTab(tab.key)}
                        className={`flex-1 py-1 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all ${
                          negTab === tab.key ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-600 hover:text-slate-400'
                        }`}
                      >{tab.label}</button>
                    ))}
                  </div>
                )}

                <textarea
                  className="input min-h-[140px] font-sans text-sm leading-relaxed bg-surface-900 mb-4"
                  value={analysis?.negotiation?.[negTab] || ''}
                  onChange={e => setAnalysis(prev => ({ ...prev, negotiation: { ...prev?.negotiation, [negTab]: e.target.value } }))}
                  placeholder={t('search.message_placeholder')}
                />

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      const msg = analysis?.negotiation?.[negTab]
                      if (!msg) return
                      navigator.clipboard.writeText(msg)
                      setCopySuccess(true)
                      setTimeout(() => setCopySuccess(false), 2000)
                    }}
                    className="btn-secondary justify-center py-2 text-[10px]"
                  >
                    {copySuccess ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copySuccess ? t('common.copied') : t('common.copy')}
                  </button>
                  <button
                    onClick={() => {
                      const msg = analysis?.negotiation?.[negTab]
                      if (!msg) return
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
                    }}
                    className="btn-secondary justify-center py-2 text-[10px] bg-green-500/10 text-green-400 border-green-500/20"
                  >
                    <ExternalLink className="w-3 h-3" /> {t('search.whatsapp')}
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons Hub (Desktop) */}
            <div className="hidden lg:flex flex-col gap-3">
              <button onClick={() => handleAddToPipeline('Watching')} className="btn-primary w-full justify-center py-3 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/10">
                <Plus className="w-4 h-4" /> {t('search.save_pipeline')}
              </button>
              <button onClick={() => {
                saveToHistory(listing, analysis?.flip_analysis?.deal_score || 0, 'Generated Listing')
                navigate('/listing', { state: { listing } })
              }} className="btn-secondary w-full justify-center py-3 bg-emerald-600/10 text-emerald-400 border-emerald-600/20 hover:bg-emerald-600/20 shadow-lg shadow-emerald-500/5">
                <Edit3 className="w-4 h-4" /> {t('search.create_listing')}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Search History Section */}
      <div className="mt-12 mb-12 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" /> {t('search.recent_activity')}
          </h2>
          <button onClick={fetchHistory} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-400 transition-colors">
            {t('search.refresh')}
          </button>
        </div>

        {history.length > 0 ? (
          <div className="card overflow-hidden border-slate-700/50 bg-surface-900/20">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="py-3 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('search.col_product')}</th>
                    <th className="py-3 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('search.col_price')}</th>
                    <th className="py-3 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('search.col_score')}</th>
                    <th className="py-3 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('search.col_action')}</th>
                    <th className="py-3 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('search.col_date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {history.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-blue-500/[0.05] transition-colors group cursor-pointer"
                      onClick={() => item.url && runAnalysis(item.url)}
                      title={item.url ? t('search.reanalyze_hint') : ''}
                    >
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                            {item.images?.[0] ? (
                              <img src={item.images[0]} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-700"><ImageIcon className="w-3 h-3" /></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-300 truncate max-w-[200px] group-hover:text-blue-400 transition-colors">{item.title}</div>
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[9px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
                                View listing <ExternalLink className="w-2 h-2" />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        <span className="text-sm font-black text-slate-200">{item.price}€</span>
                      </td>
                      <td className="py-3 px-5">
                        <div className={`text-xs font-black ${(item.score || 0) > 80 ? 'text-emerald-400' : (item.score || 0) > 50 ? 'text-amber-400' : 'text-red-400'}`}>
                          {item.score || '--'}
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          item.action === 'Saved to Pipeline' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          item.action === 'Generated Listing' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}>
                          {item.action}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <div className="text-[10px] text-slate-500 font-medium">
                          {item.timestamp ? timeSince(item.timestamp) : '—'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-800/50">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-blue-500/5"
                  onClick={() => item.url && runAnalysis(item.url)}
                >
                  <div className="w-10 h-10 rounded bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                    {item.images?.[0] ? (
                      <img src={item.images[0]} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-700"><ImageIcon className="w-3 h-3" /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-300 truncate">{item.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-black text-slate-400">{item.price}€</span>
                      <span className={`text-[10px] font-black ${(item.score || 0) > 80 ? 'text-emerald-400' : (item.score || 0) > 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {item.score ? `Score ${item.score}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span className={`block px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      item.action === 'Saved to Pipeline' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      item.action === 'Generated Listing' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}>{item.action}</span>
                    <div className="text-[10px] text-slate-600">{item.timestamp ? timeSince(item.timestamp) : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card p-10 text-center border-dashed border-slate-800 bg-transparent">
            <div className="flex flex-col items-center">
              <Clock className="w-8 h-8 text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm italic">{t('search.no_activity')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
