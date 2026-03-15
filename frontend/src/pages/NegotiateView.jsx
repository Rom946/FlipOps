import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquare, Copy, Check, ExternalLink, AlertCircle, Sparkles, MapPin, User as UserIcon, Image as ImageIcon, MessageCircle, Bot, Calendar, Save, CheckCircle } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useTranslation } from 'react-i18next'

export default function NegotiateView({ pipeline }) {
  const api = useApi()
  const { t } = useTranslation()
  const { state } = useLocation()
  const listing = state?.listing

  const TONE_OPTIONS = [
    { value: 'friendly', label: t('common.tone.friendly'), desc: t('common.tone.friendly_desc') },
    { value: 'firm', label: t('common.tone.firm'), desc: t('common.tone.firm_desc') },
    { value: 'curious', label: t('common.tone.curious'), desc: t('common.tone.curious_desc') },
  ]

  const [form, setForm] = useState({
    product: listing?.title || '',
    listed_price: listing?.price || '',
    target_price: listing?.price ? Math.round(Number(listing.price) * 0.70 / 5) * 5 : '',
    tone: 'friendly',
    defects: listing?.description || '',
    slug: listing?.item_id || '',
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState(state?.activeTab || (listing ? 'new' : 'helper'))
  
  const [discussion, setDiscussion] = useState({
    productId: state?.productId || '',
    role: 'buying', // 'buying' or 'selling'
    history: '',
    lastMessage: '',
    proposedPrice: '',
    suggestedResponse: '',
    replyTone: '',
    situacionSummary: '',
    negotiationStage: '',
    counterpartStance: '',
    strategyUsed: '',
    suggestedNextMoves: [],
    walkAwayRecommended: false,
    walkAwayReason: null,
    priceTrend: '',
    redFlags: [],
    detectedAppointment: null,
    loading: false
  })
  const [appointments, setAppointments] = useState([])
  const historyRef = useRef(null)

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [discussion.history])

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await api.analyzeListing({
        ...form,
        listed_price: parseFloat(form.listed_price) || 0,
        target_price: parseFloat(form.target_price) || 0,
        description: listing?.description ? `${listing.description}\n\n${form.defects}` : form.defects,
      })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Load history and analysis when product selection changes
  useEffect(() => {
    if (activeTab === 'helper' && discussion.productId) {
      const deal = (pipeline?.deals || []).find(d => d.id === discussion.productId)
      if (deal) {
        setDiscussion(prev => ({
          ...prev,
          history: deal.chat_history || '',
          proposedPrice: prev.proposedPrice || deal.target_buy || '',
          situacionSummary: prev.suggestedResponse ? prev.situacionSummary : ''
        }))
      }
    }
  }, [discussion.productId, activeTab, pipeline?.deals])

  const selectedDealObj = useMemo(() => {
    return (pipeline?.deals || []).find(d => d.id === discussion.productId)
  }, [discussion.productId, pipeline?.deals])

  const handleGenerateDiscussion = async () => {
    if (!discussion.lastMessage.trim()) return
    setDiscussion(prev => ({ ...prev, loading: true, suggestedResponse: '', detectedAppointment: null }))
    
    // Auto-move last message to history using role-based prefix
    const counterpart = discussion.role === 'buying' ? 'Seller' : 'Buyer'
    const newHistory = discussion.history 
      ? `${discussion.history}\n\n${counterpart}: ${discussion.lastMessage}`
      : `${counterpart}: ${discussion.lastMessage}`
    
    try {
      const product = (pipeline?.deals || []).find(i => i.id === discussion.productId) || {}
      const res = await api.generateDiscussion({
        product: {
          title: product.product || product.title,
          price: product.initial_price || product.actual_buy || product.price,
          description: product.notes || product.description,
          condition: product.condition || null,
        },
        role: discussion.role,
        history: discussion.history,
        last_message: discussion.lastMessage,
        target_price: parseFloat(discussion.proposedPrice) || product.target_buy || null,
        walk_away_price: product.target_buy || product.initial_price || null,
      })

      // Smart appointment detection logic — new schema: res.appointment.detected
      const appt = res.appointment || {}
      let finalDetected = appt.detected ? appt : null
      if (finalDetected) {
        // Map new type values back to stored convention for comparison
        const apptType = appt.type === 'buy_inspect' ? 'buying' : appt.type === 'sell_deliver' ? 'selling' : discussion.role
        const existing = appointments.find(a =>
          a.deal_id === discussion.productId &&
          a.type === apptType
        )

        if (existing) {
          const isSame =
            existing.start?.startsWith(appt.date || '') &&
            existing.location === (appt.address || appt.location || '') &&
            existing.phone === (appt.phone || '')

          if (isSame) {
            finalDetected = null
          } else {
            finalDetected = { ...finalDetected, existingId: existing.id, isUpdate: true }
          }
        }
      }

      // Update local state and persistent pipeline
      setDiscussion(prev => ({
        ...prev,
        history: newHistory,
        lastMessage: '',
        suggestedResponse: res.reply,
        replyTone: res.reply_tone || '',
        situacionSummary: res.situation_summary,
        negotiationStage: res.negotiation_stage || '',
        counterpartStance: res.counterpart_stance || '',
        strategyUsed: res.strategy_used || '',
        suggestedNextMoves: res.suggested_next_moves || [],
        walkAwayRecommended: res.walk_away_recommended || false,
        walkAwayReason: res.walk_away_reason || null,
        priceTrend: res.price_trend || '',
        redFlags: res.red_flags || [],
        detectedAppointment: finalDetected,
        // Auto-update proposed price if AI detected an agreed counteroffer
        proposedPrice: res.agreed_price != null ? String(res.agreed_price) : prev.proposedPrice,
      }))
      
      if (discussion.productId) {
        pipeline.updateDeal(discussion.productId, { chat_history: newHistory })
      }
    } catch (err) {
      setError('AI failed: ' + err.message)
    } finally {
      setDiscussion(prev => ({ ...prev, loading: false }))
    }
  }

  const handleAppendToHistory = (message) => {
    const newHistory = discussion.history 
      ? `${discussion.history}\n\nMe: ${message}`
      : `Me: ${message}`
    
    setDiscussion(prev => ({ ...prev, history: newHistory }))
    if (discussion.productId) {
      pipeline.updateDeal(discussion.productId, { chat_history: newHistory })
    }
  }

  const handleConfirmAppointment = async () => {
    if (!discussion.detectedAppointment || !discussion.productId) return
    setDiscussion(prev => ({ ...prev, loading: true }))
    try {
      const product = (pipeline?.deals || []).find(i => i.id === discussion.productId) || {}
      
      // Prepare appointment payload
      const dateStr = discussion.detectedAppointment.date || new Date().toISOString().split('T')[0]
      const start = new Date(dateStr)
      
      if (discussion.detectedAppointment.time) {
        const [hh, mm] = discussion.detectedAppointment.time.split(':')
        const h = parseInt(hh)
        const m = parseInt(mm)
        if (!isNaN(h) && !isNaN(m)) {
          start.setHours(h, m, 0, 0)
        } else {
          // Fallback if AI returned something else
          start.setHours(new Date().getHours() + 1, 0, 0, 0)
        }
      } else {
        start.setHours(new Date().getHours() + 1, 0, 0, 0)
      }

      // Check for invalid date (NaN)
      if (isNaN(start.getTime())) {
        throw new Error("Invalid date detected. Please check the appointment details.")
      }
      const end = new Date(start.getTime() + 30 * 60000) // Default 30 min

      const payload = {
        title: discussion.detectedAppointment.reason || `Meeting: ${product.product || 'Product'}`,
        start: start.toISOString(),
        end: end.toISOString(),
        location: discussion.detectedAppointment.address || discussion.detectedAppointment.location || '',
        phone: discussion.detectedAppointment.phone || '',
        description: discussion.detectedAppointment.reason,
        type: discussion.detectedAppointment.type === 'buy_inspect' ? 'buying'
            : discussion.detectedAppointment.type === 'sell_deliver' ? 'selling'
            : (discussion.detectedAppointment.type || discussion.role),
        deal_id: discussion.productId,
        deal_title: product.product || product.title
      }

      if (discussion.detectedAppointment.isUpdate && discussion.detectedAppointment.existingId) {
        await api.updateAppointment(discussion.detectedAppointment.existingId, payload)
      } else {
        await api.createAppointment(payload)
      }

      // Refresh appointments list
      const freshList = await api.getAppointments()
      setAppointments(freshList)

      // Add to history
      const apptMsg = `[System: Appointment ${discussion.detectedAppointment.isUpdate ? 'updated' : 'confirmed'} for ${discussion.detectedAppointment.date || 'TBD'}]`
      handleAppendToHistory(apptMsg)

      // Sync proposed buy price to pipeline if one has been set
      if (discussion.proposedPrice && discussion.productId) {
        const parsedPrice = parseFloat(discussion.proposedPrice)
        if (!isNaN(parsedPrice) && parsedPrice > 0) {
          pipeline.updateDeal(discussion.productId, { target_buy: parsedPrice })
        }
      }

      setDiscussion(prev => ({ ...prev, detectedAppointment: { ...prev.detectedAppointment, confirmed: true } }))
    } catch (err) {
      setError('Appointment saving failed: ' + err.message)
    } finally {
      setDiscussion(prev => ({ ...prev, loading: false }))
    }
  }

  // Auto-trigger on mount if listing is present
  useEffect(() => {
    if (listing) {
      handleSubmit()
    }
    
    // Fetch appointments to check for existing ones
    api.getAppointments().then(setAppointments).catch(e => console.error("Failed to load appointments", e))
  }, [])

  const handleCopy = async () => {
    if (!result?.message) return
    await navigator.clipboard.writeText(result.message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const discount = form.listed_price && form.target_price
    ? Math.round((1 - parseFloat(form.target_price) / parseFloat(form.listed_price)) * 100)
    : 0

  const AnalysisBanner = ({ data, summary, role, deal, proposedPrice: proposedPriceOverride }) => {
    if (!data && !summary) return null

    const score = data?.flip_analysis?.deal_score || 0
    const reasoning = data?.flip_analysis?.reasoning || summary
    const market = data?.market_data

    const bannerTitle = data ? 'AI Analysis & Strategy' : 'Negotiation Summary'

    const scoreColor = score >= 80 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                       score >= 50 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                       score > 0 ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-slate-500'

    // Use proposed price override (from discussion input) when available
    const effectiveBuy = proposedPriceOverride
      ? parseFloat(proposedPriceOverride)
      : parseFloat(deal?.target_buy || data?.flip_analysis?.suggested_buy_max || deal?.actual_buy || 0)
    const targetBuyDisplay = effectiveBuy || null
    const targetSell = parseFloat(deal?.target_sell || data?.flip_analysis?.suggested_resell_price || market?.avg_second_hand_price || 0)
    const listedPrice = deal?.initial_price

    // Margin: (resell * 0.9 - buy) / buy * 100, accounting for Wallapop 10% fee
    const margin = effectiveBuy && targetSell
      ? ((targetSell * 0.9 - effectiveBuy) / effectiveBuy * 100)
      : null

    return (
      <div className="card p-4 space-y-3 border-slate-700/50 bg-surface-900/30 animate-fade-in my-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
             <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{bannerTitle}</div>
             <p className="text-sm text-slate-200 leading-tight">{reasoning}</p>
          </div>
          {score > 0 && (
            <div className={`shrink-0 w-12 h-12 rounded-xl border flex flex-col items-center justify-center ${scoreColor}`}>
               <span className="text-[10px] uppercase font-black opacity-50 leading-none">Score</span>
               <span className="text-lg font-black leading-none mt-0.5">{score}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
           {/* Listed price */}
           <div className="bg-surface-950/50 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] font-black uppercase text-slate-500">Listed Price</div>
              <div className="text-xs font-bold text-slate-200">{listedPrice ? `${listedPrice}€` : '--'}</div>
           </div>

           {/* Margin based on proposed price */}
           <div className={`p-2 rounded-lg border ${margin !== null ? (margin >= 20 ? 'bg-emerald-500/10 border-emerald-500/30' : margin >= 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30') : 'bg-surface-950/50 border-slate-800'}`}>
              <div className="text-[9px] font-black uppercase text-slate-500">Net Margin</div>
              {margin !== null ? (
                <div className={`text-xs font-black ${margin >= 20 ? 'text-emerald-400' : margin >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                  {margin >= 0 ? '+' : ''}{margin.toFixed(1)}%
                  <span className="text-[9px] font-normal text-slate-500 ml-1">after fees</span>
                </div>
              ) : (
                <div className="text-slate-600 text-xs">--</div>
              )}
           </div>

           {/* Dynamic Target Buy based on Role */}
           <div className={`p-2 rounded-lg border ${role === 'buying' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-surface-950/50 border-slate-800'}`}>
              <div className={`text-[9px] font-black uppercase ${role === 'buying' ? 'text-blue-400' : 'text-slate-500'}`}>
                {role === 'buying' ? '🎯 Proposed Buy' : 'Resell Target'}
              </div>
              <div className={`text-xs font-bold ${role === 'buying' ? 'text-blue-400' : 'text-slate-200'}`}>
                {targetBuyDisplay ? `${targetBuyDisplay}€` : '--'}
              </div>
              {proposedPriceOverride && deal?.target_buy && parseFloat(proposedPriceOverride) !== parseFloat(deal.target_buy) && (
                <div className="text-[9px] text-slate-500 line-through">was {deal.target_buy}€</div>
              )}
           </div>

           <div className={`p-2 rounded-lg border ${role === 'selling' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-surface-950/50 border-slate-800'}`}>
              <div className={`text-[9px] font-black uppercase ${role === 'selling' ? 'text-emerald-400' : 'text-slate-500'}`}>
                {role === 'selling' ? '🎯 Target Sell' : 'Est. Resell'}
              </div>
              <div className={`text-xs font-bold ${role === 'selling' ? 'text-emerald-400' : 'text-slate-200'}`}>
                {targetSell ? `${targetSell}€` : '--'}
              </div>
           </div>
        </div>

        {market && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
             <div className="bg-surface-950/50 p-2 rounded-lg border border-slate-800">
                <div className="text-[9px] text-slate-500 uppercase font-black">Brand New Avg.</div>
                <div className="text-xs font-bold text-slate-200">{market.brand_new_price}€</div>
                <div className="text-[8px] text-slate-600 truncate">{market.brand_new_source}</div>
             </div>
             <div className="bg-surface-950/50 p-2 rounded-lg border border-slate-800">
                <div className="text-[9px] text-slate-500 uppercase font-black">2nd Hand Avg.</div>
                <div className="text-xs font-bold text-slate-200">{market.avg_second_hand_price}€</div>
                <div className="text-[8px] text-slate-600 truncate">{market.second_hand_source}</div>
             </div>
          </div>
        )}

        {deal?.seller && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
            <div className="text-[9px] font-black uppercase text-slate-500">Seller</div>
            <div className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
              deal.seller.type === 'professional'
                ? 'text-orange-400 bg-orange-500/10 border-orange-500/30'
                : 'text-slate-300 bg-slate-700/30 border-slate-600/30'
            }`}>
              {deal.seller.type === 'professional' ? '🏢 Professional' : '👤 Individual'}
            </div>
            {deal.seller.name && (
              <span className="text-[10px] text-slate-400 truncate">{deal.seller.name}</span>
            )}
            {(deal.seller.score_raw || deal.seller.scoring > 0) && (
              <span className="text-[10px] text-yellow-400 font-bold ml-auto">
                ★ {deal.seller.score_raw ?? (deal.seller.scoring / 20).toFixed(1)}
                {deal.seller.rating > 0 && <span className="text-slate-600 font-normal"> ({deal.seller.rating})</span>}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page-container max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-header mb-0">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          <span>{t('negotiate.header')}</span>
        </h1>
        
        <div className="flex bg-surface-900 p-1 rounded-xl border border-slate-700/50">
          <button 
            onClick={() => setActiveTab('new')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'new' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            New Negotiation
          </button>
          <button 
            onClick={() => setActiveTab('helper')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'helper' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Discussion Helper
          </button>
        </div>
      </div>

      {activeTab === 'new' ? (
        <>
          {listing && (
            <div className="card p-3 mb-4 bg-surface-900/50 flex items-center gap-4 animate-fade-in border-blue-500/20">
              <div className="w-16 h-16 rounded overflow-hidden bg-surface-800 shrink-0">
                {listing.image ? (
                  <img src={listing.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-slate-200 truncate">{listing.title}</h2>
                <p className="text-blue-400 font-black">{listing.price}€</p>
              </div>
              {listing.url && (
                <a href={listing.url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-500 hover:text-blue-400">
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="card p-5 space-y-4">
            <div>
              <label className="label">{t('negotiate.product_label')}</label>
              <input className="input" name="product" value={form.product} onChange={handleChange}
                placeholder={t('negotiate.product_placeholder')} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t('negotiate.listed_price')}</label>
                <input className="input" type="number" name="listed_price" value={form.listed_price}
                  onChange={handleChange} placeholder="650" required min="0" />
              </div>
              <div>
                <label className="label">{t('negotiate.your_max')}</label>
                <input className="input" type="number" name="target_price" value={form.target_price}
                  onChange={handleChange} placeholder="500" required min="0" />
              </div>
            </div>

            {discount > 0 && (
              <div className="text-xs text-center text-slate-400 -mt-2">
                {discount <= 10
                  ? t('negotiate.discount_reasonable', { pct: discount })
                  : discount <= 25
                  ? t('negotiate.discount_assertive', { pct: discount })
                  : t('negotiate.discount_aggressive', { pct: discount })}
              </div>
            )}

            <div>
              <label className="label">{t('negotiate.tone')}</label>
              <div className="grid grid-cols-3 gap-2">
                {TONE_OPTIONS.map(toneOpt => (
                  <button
                    key={toneOpt.value}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, tone: toneOpt.value }))}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      form.tone === toneOpt.value
                        ? 'border-brand-500 bg-brand-600/20 text-blue-400'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <div>{toneOpt.label}</div>
                    <div className="text-slate-500 font-normal mt-0.5">{toneOpt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">{t('negotiate.defects_label')}</label>
              <textarea className="input resize-none" rows={2} name="defects" value={form.defects}
                onChange={handleChange} placeholder={t('negotiate.defects_placeholder')} />
            </div>

            <div>
              <label className="label">{t('negotiate.slug_label')}</label>
              <input className="input" name="slug" value={form.slug} onChange={handleChange}
                placeholder={t('negotiate.slug_placeholder')} />
            </div>

            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? <span className="spinner" /> : <Sparkles className="w-4 h-4" />}
              {loading ? t('negotiate.generating') : t('negotiate.generate')}
            </button>
            
            {result && (
              <button 
                type="button"
                onClick={() => {
                  pipeline.addDeal({
                    product: form.product,
                    initial_price: form.listed_price,
                    target_buy: form.target_price,
                    actual_buy: form.listed_price,
                    target_sell: Math.round(form.listed_price * 1.2 / 5) * 5,
                    status: 'Negotiating',
                    chat_history: `Me: ${result.message}`
                  })
                  navigate('/pipeline')
                }}
                className="btn-secondary w-full justify-center py-2.5 border-blue-500/20 text-blue-400"
              >
                <Save className="w-4 h-4" /> Save to Pipeline with History
              </button>
            )}
          </form>
        </>
      ) : (
        <div className="space-y-4 animate-fade-in-up">
           {selectedDealObj?.analysis && (
             <AnalysisBanner data={selectedDealObj.analysis} role={discussion.role} deal={selectedDealObj} proposedPrice={discussion.proposedPrice} />
           )}

          <div className="card p-5 border-emerald-500/20 bg-surface-900/30">
             <div className="space-y-4">
                <div className="flex justify-between items-end gap-4">
                   <div className="flex-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">1. My Role</label>
                      <div className="grid grid-cols-2 gap-1 bg-surface-950 p-1 rounded-xl border border-slate-800">
                        <button 
                          onClick={() => setDiscussion(prev => ({ ...prev, role: 'buying' }))}
                          className={`py-1 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all ${discussion.role === 'buying' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-600'}`}
                        >Buying</button>
                        <button 
                          onClick={() => setDiscussion(prev => ({ ...prev, role: 'selling' }))}
                          className={`py-1 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all ${discussion.role === 'selling' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-600'}`}
                        >Selling</button>
                      </div>
                   </div>
                   <div className="flex-[2]">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">2. Product Context</label>
                      <select
                        className="input w-full bg-surface-950 border-slate-800 text-sm h-[34px]"
                        value={discussion.productId}
                        onChange={(e) => setDiscussion(prev => ({ ...prev, productId: e.target.value, proposedPrice: '' }))}
                      >
                        <option value="">-- Choose from Pipeline --</option>
                        {(pipeline?.deals || []).map(item => (
                          <option key={item.id} value={item.id}>{item.product} - {item.initial_price || item.buy_price}€</option>
                        ))}
                      </select>
                   </div>
                </div>
                
                <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">3. Conversation History (Optional)</label>
                    <textarea 
                      ref={historyRef}
                      className="input w-full bg-surface-950 border-slate-800 text-xs h-24 h-24 resize-none"
                      placeholder="Paste previous messages here..."
                      value={discussion.history}
                      onChange={(e) => setDiscussion(prev => ({ ...prev, history: e.target.value }))}
                    />
                </div>

                {discussion.productId && (
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">4. Your Proposed Buy Price</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        className="input w-full bg-surface-950 border-blue-500/20 text-blue-400 font-bold pr-8"
                        placeholder={selectedDealObj?.target_buy || 'e.g. 120'}
                        value={discussion.proposedPrice}
                        onChange={(e) => setDiscussion(prev => ({ ...prev, proposedPrice: e.target.value }))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold pointer-events-none">€</span>
                    </div>
                  </div>
                )}

                <div>
                   <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1.5 block">5. Last Message Received</label>
                   <textarea 
                     className="input w-full bg-surface-950 border-emerald-500/20 text-sm h-24 resize-none"
                     placeholder="What did they say?"
                     value={discussion.lastMessage}
                     onChange={(e) => setDiscussion(prev => ({ ...prev, lastMessage: e.target.value }))}
                   />
                </div>

                <button 
                 onClick={handleGenerateDiscussion}
                 disabled={discussion.loading || !discussion.lastMessage || !discussion.productId}
                 className="btn-primary w-full justify-center py-2.5 bg-emerald-600 hover:bg-emerald-500 border-emerald-500/50 shadow-emerald-500/10"
                >
                  {discussion.loading ? <span className="spinner" /> : <Sparkles className="w-4 h-4" />}
                  {discussion.loading ? 'AI Analyzing...' : 'Generate Best Response'}
                </button>
              </div>
           </div>

            {discussion.situacionSummary && (
              <AnalysisBanner summary={discussion.situacionSummary} role={discussion.role} deal={selectedDealObj} proposedPrice={discussion.proposedPrice} />
            )}


          {discussion.suggestedResponse && (
            <div className="card p-5 border-emerald-500/30 bg-emerald-500/[0.02] space-y-3 animate-fade-in-up">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm">
                    <Bot className="w-4 h-4" /> AI Suggestion
                  </div>
                  {discussion.replyTone && (
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      discussion.replyTone === 'urgent' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      discussion.replyTone === 'firm' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                      discussion.replyTone === 'friendly' || discussion.replyTone === 'warm' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                      'text-slate-400 bg-slate-700/30 border-slate-600/20'
                    }`}>{discussion.replyTone}</span>
                  )}
                  {discussion.negotiationStage && (
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      discussion.negotiationStage === 'agreed' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                      discussion.negotiationStage === 'closing' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                      discussion.negotiationStage === 'stalled' || discussion.negotiationStage === 'dead' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      'text-slate-400 bg-slate-700/30 border-slate-600/20'
                    }`}>{discussion.negotiationStage}</span>
                  )}
                  {discussion.counterpartStance && (
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      discussion.counterpartStance === 'flexible' || discussion.counterpartStance === 'interested' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                      discussion.counterpartStance === 'suspicious' || discussion.counterpartStance === 'losing_interest' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      discussion.counterpartStance === 'rushing' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                      'text-slate-400 bg-slate-700/30 border-slate-600/20'
                    }`}>{discussion.counterpartStance.replace('_', ' ')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAppendToHistory(discussion.suggestedResponse)}
                    className="btn-ghost text-[10px] py-1 px-2 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                  >
                    <Save className="w-3 h-3" /> Add to History
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(discussion.suggestedResponse)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="btn-ghost text-xs py-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Walk away warning */}
              {discussion.walkAwayRecommended && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-300">
                    <span className="font-black">Walk away recommended</span>
                    {discussion.walkAwayReason && <span className="font-normal text-red-400/80"> — {discussion.walkAwayReason}</span>}
                  </div>
                </div>
              )}

              {/* Reply text */}
              <div className="bg-surface-950 rounded-xl p-4 text-sm text-slate-200 leading-relaxed border border-slate-800">
                {discussion.suggestedResponse}
              </div>

              {/* Strategy used */}
              {discussion.strategyUsed && (
                <div className="text-[10px] text-slate-500 italic leading-relaxed">
                  Strategy: {discussion.strategyUsed}
                </div>
              )}

              {/* Red flags */}
              {discussion.redFlags?.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] font-black uppercase text-red-500 tracking-widest">Red Flags</div>
                  <div className="flex flex-wrap gap-1.5">
                    {discussion.redFlags.map((flag, i) => (
                      <span key={i} className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Price trend */}
              {discussion.priceTrend && (
                <div className="text-[10px] flex items-center gap-1.5">
                  <span className="text-slate-500 uppercase font-black tracking-widest">Price trend</span>
                  <span className={`font-black ${
                    discussion.priceTrend === 'dropping' ? 'text-emerald-400' :
                    discussion.priceTrend === 'rising' ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {discussion.priceTrend === 'dropping' ? '↓ Dropping' : discussion.priceTrend === 'rising' ? '↑ Rising' : '→ Holding'}
                  </span>
                </div>
              )}

              {/* Suggested next moves */}
              {discussion.suggestedNextMoves?.length > 0 && (
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <div className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Suggested Next Moves</div>
                  <ol className="space-y-1.5">
                    {discussion.suggestedNextMoves.map((move, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-400 leading-relaxed">
                        <span className="text-slate-600 shrink-0 font-bold">{i + 1}.</span>
                        {move}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {discussion.detectedAppointment && (
                <div className={`bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 border-l-4 border-l-amber-500 flex items-start gap-4 ${discussion.detectedAppointment.confirmed ? 'opacity-50 grayscale' : ''}`}>
                   <Calendar className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                   <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Appointment Detected</h4>
                        {discussion.detectedAppointment.confirmed && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                            <CheckCircle className="w-3 h-3" /> Confirmed
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {discussion.detectedAppointment.reason}
                        <div className="mt-2 space-y-1">
                          {discussion.detectedAppointment.date && <span className="block text-[10px] text-slate-400 font-bold">🗓️ {discussion.detectedAppointment.date} {discussion.detectedAppointment.time || ''}</span>}
                          {discussion.detectedAppointment.location && <span className="block text-[10px] text-slate-400 font-bold">📍 {discussion.detectedAppointment.location}</span>}
                          {discussion.detectedAppointment.address && <span className="block text-[10px] text-slate-400 font-bold">🏠 {discussion.detectedAppointment.address}</span>}
                          {discussion.detectedAppointment.phone && <span className="block text-[10px] text-emerald-400 font-bold">📞 {discussion.detectedAppointment.phone}</span>}
                        </div>
                      </p>
                      
                      {!discussion.detectedAppointment.confirmed && (
                        <div className="mt-3 space-y-1.5">
                          {discussion.proposedPrice && (
                            <div className="text-[9px] text-blue-400/80 font-bold">
                              ↳ Will also update Target Buy to {discussion.proposedPrice}€ in pipeline
                            </div>
                          )}
                          <button
                            onClick={handleConfirmAppointment}
                            disabled={discussion.loading}
                            className={`py-1.5 px-3 ${discussion.detectedAppointment.isUpdate ? 'bg-blue-500' : 'bg-amber-500'} text-slate-950 text-[10px] font-black uppercase tracking-tighter rounded-lg hover:opacity-80 transition-all flex items-center gap-2`}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            {discussion.detectedAppointment.isUpdate ? 'Update Appointment' : 'Confirm & Sync to Pipeline'}
                          </button>
                        </div>
                      )}
                   </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 mt-4 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 mt-4">
          <AnalysisBanner data={result} role="buying" />
          <div className="card p-5 space-y-3 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-100">{t('negotiate.result_title')}</span>
            <button onClick={handleCopy} className="btn-ghost text-xs py-1">
              {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> {t('common.copied')}</> : <><Copy className="w-3.5 h-3.5" /> {t('common.copy')}</>}
            </button>
          </div>
          <div className="bg-surface-900 rounded-lg p-4 text-sm text-slate-200 leading-relaxed border border-slate-700/50">
            {result.message}
          </div>
          {result.listing_url && (
            <a
              href={result.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" /> {t('negotiate.open_wallapop')}
            </a>
          )}
          </div>
        </div>
      )}
    </div>
  )
}
