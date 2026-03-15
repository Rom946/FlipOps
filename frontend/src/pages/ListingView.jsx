import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Tag, Copy, Check, ExternalLink, Sparkles, AlertCircle, RefreshCw, Image as ImageIcon } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useTranslation } from 'react-i18next'

const CONDITIONS = ['New', 'Like new', 'Good', 'Fair']

function CopyField({ label, value }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(String(value))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="label mb-0">{label}</label>
        <button onClick={copy} className="btn-ghost text-xs py-0.5 px-2">
          {copied ? <><Check className="w-3 h-3 text-emerald-400" /> {t('common.copied')}</> : <><Copy className="w-3 h-3" /> {t('common.copy')}</>}
        </button>
      </div>
      <div className="bg-surface-900 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 whitespace-pre-wrap">
        {value}
      </div>
    </div>
  )
}

export default function ListingView() {
  const api = useApi()
  const { t } = useTranslation()
  const { state } = useLocation()
  const listing = state?.listing

  const [form, setForm] = useState({
    product: listing?.title || '',
    bought_price: listing?.price || '',
    target_margin: '35',
    condition: 'Good',
    tone: 'persuasive',
    description: listing?.description || '',
  })

  const TONE_OPTIONS = [
    { value: 'professional', label: 'Professional', desc: 'Clear & factual' },
    { value: 'persuasive', label: 'Persuasive', desc: 'Highlight benefits' },
    { value: 'friendly', label: 'Friendly', desc: 'Casual & warm' },
  ]
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const boughtNum = parseFloat(form.bought_price) || 0
  const targetSell = Math.round(boughtNum * (1 + (parseFloat(form.target_margin) || 0) / 100))
  const profit = targetSell - boughtNum

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await api.generateListing({
        ...form,
        bought_price: parseFloat(form.bought_price),
        target_margin: parseFloat(form.target_margin),
      })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (listing) {
      handleSubmit()
    }
  }, [])

  return (
    <div className="page-container max-w-2xl">
      <h1 className="section-header mb-6">
        <Tag className="w-5 h-5 text-blue-400" />
        <span>{t('listing.header')}</span>
      </h1>

      {listing && (
        <div className="card p-3 mb-4 bg-surface-900/50 flex items-center gap-4 animate-fade-in border-blue-500/20">
          <div className="w-16 h-16 rounded overflow-hidden bg-surface-800 shrink-0">
            {(listing?.images && listing.images.length > 0) ? (
              <img src={listing.images[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
          <label className="label">{t('listing.product_label')}</label>
          <input className="input" name="product" value={form.product} onChange={handleChange}
            placeholder={t('listing.product_placeholder')} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('listing.bought_for')}</label>
            <input className="input" type="number" name="bought_price" value={form.bought_price}
              onChange={handleChange} placeholder="400" required min="0" />
          </div>
          <div>
            <label className="label">{t('listing.target_margin')}</label>
            <input className="input" type="number" name="target_margin" value={form.target_margin}
              onChange={handleChange} min="1" max="200" />
          </div>
        </div>

        {/* Live P&L preview */}
        {boughtNum > 0 && (
          <div className="grid grid-cols-3 gap-2 p-3 bg-surface-900/60 rounded-lg border border-slate-700/50">
            <div className="text-center">
              <div className="text-xs text-slate-500 mb-0.5">{t('listing.pnl_bought')}</div>
              <div className="text-sm font-semibold text-slate-200">{boughtNum}€</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 mb-0.5">{t('listing.pnl_sell')}</div>
              <div className="text-sm font-semibold text-blue-400">{targetSell}€</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 mb-0.5">{t('listing.pnl_profit')}</div>
              <div className="text-sm font-semibold text-emerald-400">+{profit}€</div>
            </div>
          </div>
        )}

        <div>
          <label className="label">{t('listing.condition')}</label>
          <div className="grid grid-cols-4 gap-2">
            {CONDITIONS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, condition: c }))}
                className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                  form.condition === c
                    ? 'border-brand-500 bg-brand-600/20 text-blue-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Listing Tone</label>
          <div className="grid grid-cols-3 gap-2">
            {TONE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, tone: opt.value }))}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                  form.tone === opt.value
                    ? 'border-brand-500 bg-brand-600/20 text-blue-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                <div className="font-bold">{opt.label}</div>
                <div className="text-slate-500 font-normal mt-0.5 text-[10px] leading-tight">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn-primary w-full justify-center" disabled={loading || !form.bought_price}>
          {loading ? <span className="spinner" /> : <Sparkles className="w-4 h-4" />}
          {loading ? t('listing.generating') : t('listing.generate')}
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 mt-4 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="card p-5 mt-4 space-y-4 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-100">{t('listing.result_title')}</span>
            <a
              href="https://es.wallapop.com/app/catalog/upload"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-xs py-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> {t('listing.post_wallapop')}
            </a>
          </div>

          <CopyField label={t('listing.field_title')} value={result.title} />
          <CopyField label={t('listing.field_price')} value={`${result.price}€`} />
          <CopyField label={t('listing.field_description')} value={result.description} />
          <CopyField label={t('listing.field_tags')} value={result.tags?.join(', ') || ''} />

          <div className="grid grid-cols-3 gap-2 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20 text-center">
            <div>
              <div className="text-xs text-slate-500">{t('listing.pnl_bought')}</div>
              <div className="text-sm font-bold text-slate-200">{result.bought_price}€</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('listing.pnl_sell')}</div>
              <div className="text-sm font-bold text-blue-400">{result.target_sell}€</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('listing.pnl_profit')}</div>
              <div className="text-sm font-bold text-emerald-400">+{result.profit}€</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
