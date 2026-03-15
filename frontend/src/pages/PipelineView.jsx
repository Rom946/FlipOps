import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layers, Plus, Trash2, ExternalLink, TrendingUp, TrendingDown, Calendar, ChevronDown, ChevronRight, Clock, MapPin, MessageCircle, Tag, Sparkles, Search, Filter, DollarSign, CheckCircle } from 'lucide-react'
import AppointmentModal from '../components/AppointmentModal'
import PlatformBadge from '../components/PlatformBadge'
import { useApi } from '../hooks/useApi'
import { useTranslation } from 'react-i18next'

const STATUS_COLORS = {
  Watching:    'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Negotiating: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Bought:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Listed:      'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Sold:        'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
}

function AddDealModal({ onAdd, onClose, initialData }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    product: initialData?.title || '',
    initial_price: initialData?.price || '',
    target_buy: initialData?.target_buy || '',
    actual_buy: initialData?.actual_buy || initialData?.price || '',
    target_sell: initialData?.target_sell || (initialData?.price ? Math.round(Number(initialData.price) * 1.35 / 5) * 5 : ''),
    url: initialData?.url || '',
    notes: initialData?.description || initialData?.notes || '',
    status: initialData?.status || 'Watching',
  })
  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd(form)
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-5 space-y-4 animate-fade-in-up">
        <h2 className="text-base font-bold text-slate-100">{t('pipeline.modal_title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">{t('pipeline.form_product')}</label>
            <input className="input" name="product" value={form.product} onChange={handleChange} required placeholder="iPhone 14..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Initial Price (€)</label>
              <input className="input" type="number" name="initial_price" value={form.initial_price} onChange={handleChange} placeholder="500" min="0" />
            </div>
            <div>
              <label className="label">Target Buy (€)</label>
              <input className="input" type="number" name="target_buy" value={form.target_buy} onChange={handleChange} placeholder="400" min="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Real Buy (€)</label>
              <input className="input" type="number" name="actual_buy" value={form.actual_buy} onChange={handleChange} placeholder="420" min="0" />
            </div>
            <div>
              <label className="label">Target Sell (€)</label>
              <input className="input" type="number" name="target_sell" value={form.target_sell} onChange={handleChange} placeholder="600" min="0" />
            </div>
          </div>
          <div>
            <label className="label">{t('pipeline.form_status')}</label>
            <select className="input" name="status" value={form.status} onChange={handleChange}>
              {['Watching','Negotiating','Bought','Listed','Sold'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('pipeline.form_url')}</label>
            <input className="input" name="url" value={form.url} onChange={handleChange} placeholder="https://es.wallapop.com/item/..." />
          </div>
          <div>
            <label className="label">{t('pipeline.form_notes')}</label>
            <input className="input" name="notes" value={form.notes} onChange={handleChange} placeholder={t('pipeline.form_notes_ph')} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary flex-1 justify-center">{t('pipeline.add_deal')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DealRow({ deal, onUpdate, onDelete, onSchedule, onEditAppointment, appointments = [], statuses, selectMode, isSelected, onToggleSelect }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const initial = parseFloat(deal.initial_price) || 0
  const targetBuy = parseFloat(deal.target_buy) || 0
  const actualBuy = parseFloat(deal.actual_buy) || 0
  const targetSell = parseFloat(deal.target_sell) || 0
  const actualSell = parseFloat(deal.actual_sell) || 0
  
  const profit = deal.status === 'Sold' ? (actualSell - actualBuy) : (targetSell - actualBuy)
  const margin = actualBuy > 0 ? ((profit / actualBuy) * 100).toFixed(1) : '—'
  const profitColor = profit >= 0 ? 'text-emerald-400' : 'text-red-400'

  const handleActualSell = (e) => {
    onUpdate(deal.id, { actual_sell: parseFloat(e.target.value) || 0 })
  }

  const handleActualBuy = (e) => {
    onUpdate(deal.id, { actual_buy: parseFloat(e.target.value) || 0 })
  }

  return (
    <>
    <tr className={`hidden md:table-row border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors ${expanded ? 'bg-slate-700/10' : ''}`}>
      {selectMode && (
        <td className="py-3 px-4 text-center">
          <input
            type="checkbox"
            className="w-4 h-4 rounded"
            checked={isSelected}
            onChange={() => onToggleSelect(deal.id)}
            onClick={e => e.stopPropagation()}
          />
        </td>
      )}
      <td className="py-3 px-4 text-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-slate-500 hover:text-slate-100 transition-colors"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </td>
      <td className="py-3 px-4">
        <PlatformBadge platform={deal.platform || 'wallapop'} />
        <div className="flex items-center gap-2 mt-1">
          <div className="text-sm font-medium text-slate-100">{deal.product}</div>
          {appointments.length > 0 && (
            <button 
              onClick={(e) => {
                e.stopPropagation()
                onEditAppointment(appointments[0])
              }}
              className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)] cursor-pointer hover:ring-2 ring-blue-400/50" 
              title="Edit appointment" 
            />
          )}
        </div>
          {deal.url && (
            <a href={deal.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5 mt-0.5">
              <ExternalLink className="w-2.5 h-2.5" /> {t('common.view')}
            </a>
          )}
      </td>
      <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap text-right">{initial > 0 ? `${initial}€` : '—'}</td>
      <td className="py-3 px-4 text-sm text-blue-400/70 whitespace-nowrap font-bold text-right">{targetBuy > 0 ? `${targetBuy}€` : '—'}</td>
      <td className="py-3 px-4 text-right">
        <input
          type="number"
          className="input w-16 py-1 text-xs bg-blue-500/5 border-blue-500/20 text-blue-400 font-bold text-right"
          value={deal.actual_buy || ''}
          onChange={handleActualBuy}
          placeholder="0"
        />
      </td>
      <td className="py-3 px-4 text-sm text-emerald-400/70 whitespace-nowrap font-bold text-right">{targetSell > 0 ? `${targetSell}€` : '—'}</td>
      <td className="py-3 px-4 text-right">
        <input
          type="number"
          className="input w-16 py-1 text-xs bg-emerald-500/5 border-emerald-500/20 text-emerald-400 font-bold text-right"
          value={deal.actual_sell || ''}
          onChange={handleActualSell}
          placeholder="0"
          disabled={deal.status !== 'Sold' && deal.status !== 'Listed'}
        />
      </td>
      <td className="py-3 px-4">
        <select
          value={deal.status}
          onChange={(e) => onUpdate(deal.id, { status: e.target.value })}
          className={`text-xs font-medium px-2 py-1 rounded-full border cursor-pointer bg-transparent outline-none ${STATUS_COLORS[deal.status]}`}
        >
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className={`py-3 px-4 text-sm font-semibold whitespace-nowrap text-right ${profitColor}`}>
        {profit !== 0 ? `${profit >= 0 ? '+' : ''}${profit.toFixed(0)}€` : '—'}
      </td>
      <td className={`py-3 px-4 text-xs text-right ${profitColor}`}>{margin !== '—' ? `${margin}%` : '—'}</td>
      <td className="py-3 px-4">
        <div className="flex gap-1">
          <button
            onClick={() => navigate('/negotiate', { state: { activeTab: 'helper', productId: deal.id } })}
            className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded"
            title="Discussion Helper"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/search', { state: { autoUrl: deal.url } })}
            className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded"
            title="Analyze again"
          >
            <Sparkles className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/listing', { state: { listing: { title: deal.product, price: deal.buy_price, description: deal.notes, item_id: deal.slug, url: deal.url } } })}
            className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded"
            title="Generate Listing"
          >
            <Tag className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSchedule(deal)}
            className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded"
            title={t('pipeline.schedule')}
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(deal.id)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>

    {/* Mobile Card Row */}
    <tr className="md:hidden border-b border-slate-700/50">
      <td colSpan="11" className="p-0">
        <div className={`p-3 sm:p-4 ${expanded ? 'bg-slate-700/10' : ''} space-y-3 max-w-[100vw] overflow-hidden`}>
          <div className="flex items-center justify-between gap-2 px-1">
             {selectMode && (
               <input
                 type="checkbox"
                 className="w-5 h-5 rounded shrink-0"
                 checked={isSelected}
                 onChange={() => onToggleSelect(deal.id)}
               />
             )}
             <div className="flex-1 min-w-0">
               <PlatformBadge platform={deal.platform || 'wallapop'} />
               <div className="text-sm font-black text-white truncate mt-0.5">{deal.product}</div>
             </div>
             <div className="flex items-center gap-1.5 shrink-0">
                {appointments.length > 0 && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                <select
                  value={deal.status}
                  onChange={(e) => onUpdate(deal.id, { status: e.target.value })}
                  className={`text-[9px] font-black px-2 py-0.5 rounded-full border bg-transparent outline-none ${STATUS_COLORS[deal.status]}`}
                >
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
             </div>
          </div>
          
          <div className="flex items-center justify-between px-1 mb-1">
             {deal.url && (
               <a href={deal.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 font-bold flex items-center gap-1">
                  <ExternalLink className="w-2.5 h-2.5" /> {t('common.view')}
               </a>
             )}
             <div className={`text-xs font-black ${profitColor}`}>
               {profit !== 0 ? `${profit >= 0 ? '+' : ''}${profit.toFixed(0)}€` : '—'}
               <span className="ml-1 opacity-70">({margin !== '—' ? `${margin}%` : '—'})</span>
             </div>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-surface-900/40 p-3 rounded-2xl border border-slate-800/50">
             <div className="space-y-0.5">
                <div className="text-[8px] text-slate-500 uppercase font-black leading-tight">Initial</div>
                <div className="text-xs font-bold text-slate-300">{initial}€</div>
             </div>
             <div className="space-y-0.5">
                <div className="text-[8px] text-slate-500 uppercase font-black leading-tight">Target Buy</div>
                <div className="text-xs font-bold text-blue-400/60">{targetBuy}€</div>
             </div>
             <div className="space-y-0.5">
                <div className="text-[8px] text-blue-400 uppercase font-black leading-tight">Real Buy</div>
                <input
                  type="number"
                  className="w-full bg-transparent text-xs font-bold text-blue-400 outline-none p-0 border-b border-blue-500/20"
                  value={deal.actual_buy || ''}
                  onChange={handleActualBuy}
                  placeholder="0"
                />
              </div>
             
             <div className="space-y-0.5 pt-1">
                <div className="text-[8px] text-slate-500 uppercase font-black leading-tight">Target Sell</div>
                <div className="text-xs font-bold text-emerald-400/60">{targetSell}€</div>
             </div>
             <div className="space-y-0.5 pt-1">
                <div className="text-[8px] text-emerald-400 uppercase font-black leading-tight">Real Sell</div>
                <input
                  type="number"
                  className="w-full bg-transparent text-xs font-bold text-emerald-400 outline-none p-0 border-b border-emerald-500/20"
                  value={deal.actual_sell || ''}
                  onChange={handleActualSell}
                  placeholder="0"
                  disabled={deal.status !== 'Sold' && deal.status !== 'Listed'}
                />
             </div>
             <div className="space-y-0.5 pt-1">
                <div className="text-[8px] text-slate-500 uppercase font-black leading-tight">Profit</div>
                <div className={`text-xs font-bold ${profitColor}`}>
                  {profit >= 0 ? '+' : ''}{profit.toFixed(0)}€
                </div>
             </div>
          </div>

          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => navigate('/negotiate', { state: { activeTab: 'helper', productId: deal.id } })}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider whitespace-nowrap"
            >
            <MessageCircle className="w-2.5 h-2.5" /> Helper
            </button>
            <button
              onClick={() => navigate('/search', { state: { autoUrl: deal.url } })}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-blue-600/10 text-blue-400 rounded-lg border border-blue-500/20 text-[9px] font-black uppercase tracking-wider whitespace-nowrap"
            >
              <Sparkles className="w-2.5 h-2.5" /> Analyze
            </button>
            <button
              onClick={() => navigate('/listing', { state: { listing: { title: deal.product, price: deal.actual_buy || deal.initial_price, description: deal.notes, item_id: deal.slug, url: deal.url } } })}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 text-[9px] font-black uppercase tracking-wider whitespace-nowrap"
            >
              <Tag className="w-2.5 h-2.5" /> List
            </button>
            <button onClick={() => setExpanded(!expanded)} className="px-2 bg-slate-800 text-slate-400 rounded-lg border border-slate-700">
               {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => onDelete(deal.id)} className="px-2 bg-slate-800 text-red-500/70 rounded-lg border border-slate-700">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </td>
    </tr>

    {expanded && (
      <tr className="bg-slate-900/60 border-b border-slate-700/50">
        <td colSpan="11" className="py-4 px-4 md:px-12">
          <div className="space-y-3">
            <h4 className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-2">{t('pipeline.timeline')}</h4>
            {appointments.length === 0 ? (
              <p className="text-xs text-slate-600 italic">{t('pipeline.no_appointments')}</p>
            ) : (
              <div className="space-y-2 border-l-2 border-slate-800 ml-2 pl-4">
                {appointments.map(app => (
                  <div 
                    key={app.id} 
                    className="flex items-start gap-3 group cursor-pointer hover:bg-slate-700/30 p-2 rounded-lg transition-colors -ml-2"
                    onClick={() => onEditAppointment(app)}
                  >
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 -ml-[13px] ring-4 ring-slate-900 group-hover:ring-slate-800" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">{app.title}</span>
                        <span className="text-[10px] text-slate-500">{new Date(app.start).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {app.location && (
                          <span className="flex items-center gap-1 text-[10px] text-slate-500">
                            <MapPin className="w-3 h-3" /> {app.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Clock className="w-3 h-3" /> {app.type}
                        </span>
                        {app.phone && (
                          <span className="flex items-center gap-1 text-[10px] text-blue-400">
                            <span className="font-bold">Tel:</span> {app.phone}
                          </span>
                        )}
                        {app.location && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(app.location)}`, '_blank')
                            }}
                            className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded flex items-center gap-1 hover:bg-blue-500/30 transition-colors"
                          >
                            <MapPin className="w-2.5 h-2.5" />
                            <span>Directions</span>
                          </button>
                        )}
                      </div>
                      {app.description && (
                        <div className="mt-1.5 p-2 bg-slate-800/50 rounded text-[10px] text-slate-400 border border-slate-700/50">
                          {app.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                onSchedule(deal)
              }}
              className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2"
            >
              <Plus className="w-3 h-3" /> {t('pipeline.add_event')}
            </button>
          </div>
        </td>
      </tr>
    )}
    </>
  )
}



export default function PipelineView({ pipeline }) {
  const api = useApi()
  const { t } = useTranslation()
  const { state } = useLocation()
  const [showModal, setShowModal] = useState(false)
  const [showApptModal, setShowApptModal] = useState(false)
  const [initialData, setInitialData] = useState(null)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [showSoldItems, setShowSoldItems] = useState(false)
  const [appointments, setAppointments] = useState([])
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('Negotiating')
  const [bulkApplying, setBulkApplying] = useState(false)

  const { deals, addDeal, updateDeal, deleteDeal, STATUS_ORDER, stats } = pipeline

  useEffect(() => {
    fetchAppointments()
  }, [])

  const fetchAppointments = async () => {
    try {
      const data = await api.getAppointments()
      setAppointments(data)
    } catch (err) {
      console.error('Failed to load appointments')
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const activeDeals = deals.filter(d => d.status !== 'Sold')
    if (selectedIds.size === activeDeals.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(activeDeals.map(d => d.id)))
    }
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const applyBulkStatus = async () => {
    if (selectedIds.size === 0) return
    setBulkApplying(true)
    try {
      const timestamps = {}
      if (bulkStatus === 'Sold') timestamps.soldAt = new Date().toISOString()
      if (bulkStatus === 'Listed') timestamps.listedAt = new Date().toISOString()
      if (bulkStatus === 'Bought') timestamps.boughtAt = new Date().toISOString()

      Array.from(selectedIds).forEach(id => {
        updateDeal(id, { status: bulkStatus, ...timestamps })
      })
      exitSelectMode()
    } finally {
      setBulkApplying(false)
    }
  }

  useEffect(() => {
    if (state?.listing) {
      setInitialData({
        ...state.listing,
        status: state.listing.status || 'Watching'
      })
      setShowModal(true)
      // Clear state after reading to avoid re-opening on refresh
      window.history.replaceState({}, document.title)
    }
  }, [state])

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-header">
          <Layers className="w-5 h-5 text-blue-400" />
          <span>{t('pipeline.header')}</span>
          <span className="text-sm font-normal text-slate-500 ml-1">({t('pipeline.deals_count', { count: deals.length })})</span>
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()) }}
            className={`btn text-xs ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
          >
            {selectMode ? t('pipeline.select_cancel') : t('pipeline.select')}
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> {t('pipeline.add_deal')}
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: t('pipeline.stat_total'), value: stats.totalDeals, color: 'text-slate-200' },
          { label: t('pipeline.stat_sold'), value: stats.soldDeals, color: 'text-emerald-400' },
          { label: t('pipeline.stat_active'), value: stats.activeDeals, color: 'text-blue-400' },
          { label: t('pipeline.stat_profit'), value: `${stats.totalProfit.toFixed(0)}€`, color: stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(item => (
          <div key={item.label} className="card p-3 text-center">
            <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>

      {deals.length === 0 ? (
        <div className="card p-12 text-center">
          <Layers className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">{t('pipeline.empty_title')}</p>
          <p className="text-slate-600 text-sm mt-1">{t('pipeline.empty_desc')}</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4 mx-auto">
            <Plus className="w-4 h-4" /> {t('pipeline.add_first')}
          </button>
        </div>
      ) : (
      <div className="space-y-6">
        <div className="card overflow-x-auto md:overflow-visible">
          <table className="w-full text-left min-w-full md:min-w-[700px]">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-slate-700">
                {selectMode && (
                  <th className="py-3 px-4">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded"
                      checked={selectedIds.size > 0 && selectedIds.size === deals.filter(d => d.status !== 'Sold').length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th className="py-3 px-4 text-center"></th>
                {[t('pipeline.col_product'), 'Initial', 'Target Buy', 'Real Buy', 'Target Sell', 'Real Sell', t('pipeline.col_status'), t('pipeline.col_profit'), t('pipeline.col_margin'), ''].map(h => (
                  <th key={h} className={`py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide ${['Initial', 'Target Buy', 'Real Buy', 'Target Sell', 'Real Sell', t('pipeline.col_profit'), t('pipeline.col_margin')].includes(h) ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.filter(d => d.status !== 'Sold').map(deal => (
                <DealRow
                  key={deal.id}
                  deal={deal}
                  onUpdate={updateDeal}
                  onDelete={deleteDeal}
                  onSchedule={(deal) => {
                    setSelectedDeal(deal)
                    setSelectedAppointment(null)
                    setShowApptModal(true)
                  }}
                  onEditAppointment={(appt) => {
                    setSelectedDeal(deals.find(d => d.id === appt.deal_id))
                    setSelectedAppointment(appt)
                    setShowApptModal(true)
                  }}
                  appointments={appointments.filter(a => a.deal_id === deal.id)}
                  statuses={STATUS_ORDER}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(deal.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
              {deals.filter(d => d.status !== 'Sold').length === 0 && (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-500 italic">
                    {t('pipeline.no_active_deals')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Sold Items Foldable Section */}
        {deals.some(d => d.status === 'Sold') && (
          <div className="space-y-3">
            <button 
              onClick={() => setShowSoldItems(!showSoldItems)}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors w-full group"
            >
              <div className="h-[1px] flex-1 bg-slate-800 group-hover:bg-slate-700" />
              <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-800/50 rounded-full text-xs font-bold uppercase tracking-wider">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
                {t('pipeline.sold_items')} ({deals.filter(d => d.status === 'Sold').length})
                <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${showSoldItems ? 'rotate-180' : ''}`} />
              </div>
              <div className="h-[1px] flex-1 bg-slate-800 group-hover:bg-slate-700" />
            </button>

            {showSoldItems && (
              <div className="card overflow-x-auto md:overflow-visible opacity-80 hover:opacity-100 transition-opacity animate-in fade-in slide-in-from-top-2">
                <table className="w-full text-left min-w-full md:min-w-[700px]">
                  <thead className="hidden md:table-header-group">
                    <tr className="border-b border-slate-700">
                      <th className="py-3 px-4 text-center"></th>
                      {[t('pipeline.col_product'), 'Initial', 'Target Buy', 'Real Buy', 'Target Sell', 'Real Sell', t('pipeline.col_status'), t('pipeline.col_profit'), t('pipeline.col_margin'), ''].map(h => (
                        <th key={h} className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deals.filter(d => d.status === 'Sold').map(deal => (
                      <DealRow
                        key={deal.id}
                        deal={deal}
                        onUpdate={updateDeal}
                        onDelete={deleteDeal}
                        onSchedule={(deal) => {
                          setSelectedDeal(deal)
                          setSelectedAppointment(null)
                          setShowApptModal(true)
                        }}
                        onEditAppointment={(appt) => {
                          setSelectedDeal(deals.find(d => d.id === appt.deal_id))
                          setSelectedAppointment(appt)
                          setShowApptModal(true)
                        }}
                        appointments={appointments.filter(a => a.deal_id === deal.id)}
                        statuses={STATUS_ORDER}
                        selectMode={false}
                        isSelected={false}
                        onToggleSelect={() => {}}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {selectMode && selectedIds.size > 0 && (
        <div
          className="fixed left-0 right-0 z-50 bg-surface-900 border-t border-slate-700/50 px-4 py-3 flex items-center gap-3"
          style={{ bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}
        >
          <span className="text-sm font-bold text-slate-300 shrink-0">
            {selectedIds.size} {t('pipeline.selected')}
          </span>
          <select
            className="input flex-1 text-sm py-1"
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
          >
            {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={bulkApplying}
            className="btn-primary text-sm py-1.5 shrink-0"
          >
            {bulkApplying ? t('common.loading') : t('pipeline.apply')}
          </button>
          <button
            onClick={exitSelectMode}
            className="btn-secondary text-sm py-1.5 shrink-0"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      {showModal && <AddDealModal onAdd={addDeal} onClose={() => setShowModal(false)} initialData={initialData} />}

      <AppointmentModal
        isOpen={showApptModal}
        onClose={() => {
          setShowApptModal(false)
          setSelectedAppointment(null)
        }}
        dealId={selectedDeal?.id}
        dealTitle={selectedDeal?.product}
        appointment={selectedAppointment}
        onCreated={fetchAppointments}
      />
    </div>
  )
}
