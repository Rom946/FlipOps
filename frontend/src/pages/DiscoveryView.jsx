import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search, Rocket, MapPin, Image as ImageIcon,
  ExternalLink, Plus, Sparkles, AlertCircle, RefreshCw,
  Target, Zap, X, CheckCircle, TrendingUp, TrendingDown,
  ChevronDown, Star, Clock, Bookmark
} from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useTranslation } from 'react-i18next'

export default function DiscoveryView({ pipeline }) {
  const api = useApi()
  const navigate = useNavigate()
  const locationRouter = useLocation()
  const { t } = useTranslation()

  const [keywords, setKeywords] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [listings, setListings] = useState([])
  const [discarded, setDiscarded] = useState([])
  const [filteredOut, setFilteredOut] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [addedIds, setAddedIds] = useState(new Set())
  const [expandedTextIds, setExpandedTextIds] = useState(new Set())
  const [isDiscardedExpanded, setIsDiscardedExpanded] = useState(false)

  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const [recentSearches, setRecentSearches] = useState([])
  const [savedSearches, setSavedSearches] = useState([])

  const restoreState = React.useCallback((state) => {
    setKeywords(state.keywords || '')
    setLocation(state.location || '')
    setListings(state.listings || [])
    setDiscarded(state.discarded || [])
    setPage(state.page || 1)
    setHasMore(state.hasMore || false)
    setAddedIds(new Set(state.addedIds || []))
  }, [])

  useEffect(() => {
    let mounted = true
    const fetchUserSearches = async () => {
      try {
        const user = await api.getMe()
        if (!mounted) return
        if (user.recent_searches) setRecentSearches(user.recent_searches)
        if (user.saved_searches) setSavedSearches(user.saved_searches)
      } catch (err) {
        console.error('Failed to load user searches', err)
      }
    }
    fetchUserSearches()
    
    // Restore state from router (Back button) OR sessionStorage (sidebar navigation)
    const routerState = locationRouter.state?.restoredState
    const sessionStateStr = sessionStorage.getItem('flipops_discovery_state')
    
    if (routerState) {
      restoreState(routerState)
      window.history.replaceState({}, document.title)
    } else if (sessionStateStr) {
      try {
        const sessionState = JSON.parse(sessionStateStr)
        restoreState(sessionState)
      } catch(e) {
        console.error("Failed to parse session state", e)
      }
    }
    
    return () => { mounted = false }
  }, [locationRouter.state, restoreState])

  // Save state to sessionStorage whenever it updates to preserve across sidebar clicks
  useEffect(() => {
    if ((listings.length > 0 || discarded.length > 0) && !loading) {
      sessionStorage.setItem('flipops_discovery_state', JSON.stringify({
        keywords,
        location,
        listings,
        discarded,
        page,
        hasMore,
        addedIds: Array.from(addedIds)
      }))
    }
  }, [keywords, location, listings, discarded, page, hasMore, addedIds, loading])

  const toggleText = (id) => {
    setExpandedTextIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleScan = async (e, overrideKeywords = null, overrideLocation = null) => {
    if (e) e.preventDefault()
    
    const scanKeywords = overrideKeywords !== null ? overrideKeywords : keywords
    const scanLocation = overrideLocation !== null ? overrideLocation : location

    if (!scanKeywords.trim()) return

    if (overrideKeywords !== null) setKeywords(overrideKeywords)
    if (overrideLocation !== null) setLocation(overrideLocation)

    setLoading(true)
    setError('')
    setListings([])
    setDiscarded([])
    setFilteredOut(0)
    setAddedIds(new Set())
    setPage(1)

    // Save recent search
    const searchObj = { keywords: scanKeywords.trim(), location: scanLocation.trim() }
    const isDuplicate = recentSearches.some(s => s.keywords === searchObj.keywords && s.location === searchObj.location)
    
    if (!isDuplicate) {
      const newRecent = [searchObj, ...recentSearches].slice(0, 5) // Keep last 5
      setRecentSearches(newRecent)
      api.updateSettings({ recent_searches: newRecent })
    }

    try {
      const data = await api.discover(scanKeywords.trim(), scanLocation.trim(), 1)
      if (data.error) throw new Error(data.error)

      // Split into available and discarded (sold/reserved)
      const available = []
      const discardedItems = []

      data.forEach(item => {
        const status = (item.status || '').toLowerCase()
        const isSold = ['sold', 'reserved', 'vendido', 'reservado', 'inactive'].includes(status)
        if (isSold) {
          discardedItems.push(item)
        } else {
          available.push(item)
        }
      })

      if (available.length === 0 && discardedItems.length === 0) {
        setError(t('discovery.no_listings'))
        setHasMore(false)
        return
      }

      setHasMore(data.length > 0)
      
      // Deduplicate by item_id
      const uniqueAvailable = available.filter((item, index, self) => 
        index === self.findIndex((t) => t.item_id === item.item_id)
      )
      const uniqueDiscarded = discardedItems.filter((item, index, self) => 
        index === self.findIndex((t) => t.item_id === item.item_id)
      ).filter(d => !uniqueAvailable.some(a => a.item_id === d.item_id))

      setListings(uniqueAvailable)
      setDiscarded(uniqueDiscarded)
      if (uniqueAvailable.length > 0) {
        handleBatchAnalyze(uniqueAvailable, true)
      }
    } catch (err) {
      setError(err.message || t('discovery.failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMore = async () => {
    if (loading || analyzing) return
    const nextPage = page + 1
    setLoading(true)
    setPage(nextPage)

    try {
      const data = await api.discover(keywords.trim(), location.trim(), nextPage)
      if (data.error) throw new Error(data.error)

      const available = []
      const discardedItems = []

      data.forEach(item => {
        const status = (item.status || '').toLowerCase()
        const isSold = ['sold', 'reserved', 'vendido', 'reservado', 'inactive'].includes(status)
        if (isSold) {
          discardedItems.push(item)
        } else {
          available.push(item)
        }
      })

      if (available.length === 0 && discardedItems.length === 0) {
        setHasMore(false)
        return
      }

      setHasMore(data.length > 0)
      setListings(prev => {
        const existingIds = new Set(prev.map(i => i.item_id))
        const newAvailable = available.filter(i => !existingIds.has(i.item_id))
        return [...prev, ...newAvailable]
      })
      
      setDiscarded(prev => {
        const existingIds = new Set(prev.map(i => i.item_id))
        const newListingsIds = new Set(available.map(i => i.item_id))
        // Filtering out items that are already in discarded OR are in the current available list to avoid double move
        const newDiscarded = discardedItems.filter(i => !existingIds.has(i.item_id) && !newListingsIds.has(i.item_id))
        return [...prev, ...newDiscarded]
      })

      if (available.length > 0) {
        handleBatchAnalyze(available, false)
      }
    } catch (err) {
      setError(err.message || t('discovery.failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleBatchAnalyze = async (items, isNewScan = false) => {
    setAnalyzing(true)
    try {
      const analysis = await api.batchAnalyze(items, keywords)

      setListings(prev => {
        const analyzedItems = []
        const lowRelevance = []

        prev.forEach(item => {
          const match = analysis.find(a => a.id === item.item_id)
          if (match) {
            const cappedTarget = match.target_buy ? Math.min(match.target_buy, item.price) : null
            const targetResell = match.estimated_resell || (cappedTarget ? Math.round(cappedTarget * 1.35) : null)
            const analyzedItem = { ...item, ...match, target: cappedTarget, target_resell: targetResell, analyzed: true }
            
            if (analyzedItem.score < 50) {
              lowRelevance.push(analyzedItem)
            } else {
              analyzedItems.push(analyzedItem)
            }
          }
        })

        if (lowRelevance.length > 0) {
           setDiscarded(prevD => {
             const existingIds = new Set(prevD.map(i => i.item_id))
             const newDiscarded = lowRelevance.filter(i => !existingIds.has(i.item_id))
             return [...prevD, ...newDiscarded]
           })
        }

        return analyzedItems.sort((a, b) => (b.score || 0) - (a.score || 0))
      })
    } catch (err) {
      console.error('Batch analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleAddToPipeline = (item) => {
    const targetBuy = item.target || item.price
    const targetSell = item.target_resell || Math.round(targetBuy * 1.35)
    pipeline.addDeal({
      product: item.title,
      initial_price: item.price,
      target_buy: targetBuy,
      actual_buy: item.price, // Default to listed price until bought
      target_sell: targetSell,
      actual_sell: 0,
      url: item.url,
      slug: item.item_id,
      status: 'Watching',
      analysis: {
        flip_analysis: {
          deal_score: item.score,
          reasoning: item.reason
        },
        market_data: {
          avg_second_hand_price: item.target_resell
        }
      }
    })
    setAddedIds(prev => new Set([...prev, item.item_id]))
    setSuccess(`"${item.title?.slice(0, 30)}..." ${t('discovery.added_pipeline')}`)
    setTimeout(() => setSuccess(''), 3000)
  }
  
  const handleMoveToMain = (item) => {
    // Remove from discarded
    setDiscarded(prev => prev.filter(i => i.item_id !== item.item_id))
    // Add to listings
    setListings(prev => {
      const exists = prev.some(i => i.item_id === item.item_id)
      if (exists) return prev
      // Ensure it's marked as analyzed so it doesn't get kicked back to discarded if its score is > 50 but < scan threshold
      const rescuedItem = { ...item, analyzed: true }
      return [...prev, rescuedItem].sort((a,b) => (b.score || 0) - (a.score || 0))
    })
    setSuccess(`"${item.title?.slice(0, 30)}..." moved back to recommendations.`)
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleAnalyzeItem = (item) => {
    navigate('/search', { 
      state: { 
        autoUrl: item.url,
        discoveryState: {
          keywords,
          location,
          listings,
          discarded,
          page,
          hasMore,
          addedIds: Array.from(addedIds)
        }
      } 
    })
  }

  const toggleSaveSearch = () => {
    if (!keywords.trim()) return
    const searchObj = { keywords: keywords.trim(), location: location.trim() }
    const isSavedLocale = savedSearches.some(s => s.keywords === searchObj.keywords && s.location === searchObj.location)
    
    let newSaved
    if (isSavedLocale) {
      newSaved = savedSearches.filter(s => s.keywords !== searchObj.keywords || s.location !== searchObj.location)
    } else {
      newSaved = [...savedSearches, searchObj]
    }
    setSavedSearches(newSaved)
    api.updateSettings({ saved_searches: newSaved })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
          <Zap className="w-8 h-8 text-yellow-400 fill-yellow-400/20" /> {t('discovery.header')}
        </h1>
        <p className="text-slate-400 mt-2">
          {t('discovery.subtitle')}
        </p>
      </div>

      {/* Search Form */}
      <div className="card p-6 mb-8 border-yellow-500/20 bg-gradient-to-br from-yellow-500/[0.03] to-transparent">
        <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-11 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 transition-all font-medium"
              placeholder={t('discovery.keyword_placeholder')}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              required
            />
          </div>
          <div className="relative sm:w-52">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-11 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 transition-all font-medium"
              placeholder={t('discovery.location_placeholder')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={toggleSaveSearch}
            disabled={!keywords.trim()}
            className="p-3 shrink-0 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group flex items-center justify-center"
            title="Save Search"
          >
            <Star className={`w-5 h-5 transition-all group-hover:scale-110 ${keywords.trim() && savedSearches.some(s => s.keywords === keywords.trim() && s.location === location.trim()) ? 'fill-yellow-500 text-yellow-500' : 'text-slate-400'}`} />
          </button>
          <button
            type="submit"
            disabled={loading || !keywords.trim()}
            className="btn-primary flex-1 sm:flex-none bg-yellow-600 hover:bg-yellow-500 border-yellow-400/20 px-6 disabled:opacity-50 disabled:cursor-not-allowed group whitespace-nowrap"
          >
            {loading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> {t('discovery.scanning')}</>
            ) : (
              <><Rocket className="w-4 h-4 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" /> {t('discovery.scan')}</>
            )}
          </button>
        </form>

        {/* Searches section */}
        {(recentSearches.length > 0 || savedSearches.length > 0) && (
          <div className="mt-5 flex flex-col gap-3">
            {savedSearches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
                   <Star className="w-3 h-3 fill-slate-500" /> {t('discovery.saved_searches')}
                </span>
                {savedSearches.map((s, idx) => (
                  <button
                    key={`saved-${idx}`}
                    type="button"
                    onClick={() => handleScan(null, s.keywords, s.location || '')}
                    className="text-xs font-medium px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors flex items-center gap-1.5"
                  >
                    {s.keywords} {s.location && <span className="opacity-60 text-[10px]">&bull; {s.location}</span>}
                  </button>
                ))}
              </div>
            )}
            
            {recentSearches.filter(r => 
              !savedSearches.some(s => 
                s.keywords.toLowerCase() === r.keywords.toLowerCase() && 
                (s.location || '').toLowerCase() === (r.location || '').toLowerCase()
              )
            ).length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
                  <Clock className="w-3 h-3" /> {t('discovery.recent_searches')}
                </span>
                {recentSearches.filter(r => 
                  !savedSearches.some(s => 
                    s.keywords.toLowerCase() === r.keywords.toLowerCase() && 
                    (s.location || '').toLowerCase() === (r.location || '').toLowerCase()
                  )
                ).map((s, idx) => (
                  <button
                    key={`recent-${idx}`}
                    type="button"
                    onClick={() => handleScan(null, s.keywords, s.location || '')}
                    className="text-xs font-medium px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50 hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    {s.keywords} {s.location && <span className="opacity-50 text-[10px]">&bull; {s.location}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> {success}
          </div>
        )}
      </div>

      {/* Status bar during analysis */}
      {analyzing && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-yellow-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>{t('discovery.ai_filtering')}</span>
        </div>
      )}

      {/* Filtered out notice */}
      {!analyzing && filteredOut > 0 && (
        <div className="mb-4 flex items-center gap-2 text-xs text-slate-500 px-1">
          <X className="w-3 h-3 text-red-500/60" />
          <span>{t(filteredOut > 1 ? 'discovery.filtered_out_plural' : 'discovery.filtered_out', { count: filteredOut })}</span>
        </div>
      )}

      {/* Results */}
      {listings.length > 0 ? (
        <div className="space-y-6">
          <div className="card overflow-hidden border-slate-700/50">
            <div className="overflow-x-auto">
              <table className="w-full text-left max-w-full">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[38%]">{t('discovery.col_listing')}</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[10%] text-center">Price</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[11%] text-center">Target Buy</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[11%] text-center">Target Resell</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[20%]">Flip Metrics</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right w-[10%]">{t('discovery.col_action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 hidden md:table-row-group">
                  {listings.map((item) => (
                    <tr key={item.item_id} className="hover:bg-yellow-500/[0.02] transition-colors group border-b border-slate-700/50 lg:border-none">
                      <td className="py-4 px-6">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden shrink-0 border border-slate-700 group-hover:border-yellow-500/30 transition-colors mt-0.5">
                            {item.images?.[0] ? (
                              <img src={item.images[0]} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-700"><ImageIcon className="w-4 h-4" /></div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-slate-200 leading-snug group-hover:text-yellow-400 transition-colors">{item.title}</div>
                            <div className="flex items-center gap-3 mt-1 mb-2">
                              {item.location?.city && (
                                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5" /> {item.location.city}
                                </span>
                              )}
                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold">
                                {t('common.view')} <ExternalLink className="w-2 h-2" />
                              </a>
                            </div>
                            {item.score ? (
                              <div
                                onClick={() => toggleText(item.item_id)}
                                className="cursor-pointer hover:bg-white/[0.03] rounded-lg transition-colors -ml-1 p-1"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={`px-2 py-0.5 rounded-lg text-xs font-black shrink-0 ${item.score >= 80 ? 'bg-emerald-500/10 text-emerald-400' : item.score >= 50 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>{item.score}</div>
                                  {item.verdict && (
                                    <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase shrink-0 border ${
                                      item.verdict === 'buy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                                      item.verdict === 'negotiate' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                                      item.verdict === 'filtered' ? 'text-slate-500 bg-slate-800 border-slate-700' :
                                      'text-red-400 bg-red-500/10 border-red-500/30'
                                    }`}>{item.verdict}</div>
                                  )}
                                </div>
                                <div className={`text-[11px] text-slate-400 leading-relaxed ${expandedTextIds.has(item.item_id) ? '' : 'line-clamp-2'}`}>
                                  {item.reason}
                                </div>
                              </div>
                            ) : item.verdict === undefined ? (
                              <div className="w-32 h-2 bg-slate-800 rounded animate-pulse" />
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-center">
                          <span className="text-lg font-black text-slate-100">{item.price}€</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {item.target ? (
                          <div className="flex flex-col text-blue-400 font-black text-xl items-center">
                            <div className="flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> {item.target}€</div>
                            {item.target < item.price && (
                              <div className="text-[10px] text-emerald-500/70 mt-0.5 font-bold">
                                -{(item.price - item.target).toFixed(1)}€
                              </div>
                            )}
                          </div>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {item.target_resell ? (
                          <div className="flex flex-col text-emerald-400 font-black text-xl items-center">
                            <div className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> {item.target_resell}€</div>
                          </div>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-4 px-6">
                        {item.score ? (
                          <div className="space-y-2">
                            {item.net_profit != null && (
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className={`text-base font-black ${item.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {item.net_profit >= 0 ? '+' : ''}{item.net_profit}€
                                </span>
                                {item.real_margin_pct != null && (
                                  <span className="text-[10px] font-bold text-slate-500">{item.real_margin_pct.toFixed(1)}%</span>
                                )}
                                {item.time_to_sell && (
                                  <span className={`text-[10px] font-bold ${item.time_to_sell === 'fast' ? 'text-emerald-500' : item.time_to_sell === 'medium' ? 'text-amber-500' : 'text-slate-500'}`}>
                                    ⏱ {item.time_to_sell}
                                  </span>
                                )}
                              </div>
                            )}
                            {item.negotiation_angle && (
                              <div className="text-[10px] text-indigo-300/70 italic border-l border-indigo-500/20 pl-2 leading-relaxed">
                                {item.negotiation_angle}
                              </div>
                            )}
                            {item.red_flags?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.red_flags.map((flag, i) => (
                                  <span key={i} className="text-[9px] text-red-400/80 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">⚠ {flag.replace(/_/g, ' ')}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : <div className="w-24 h-2 bg-slate-800 rounded animate-pulse" />}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleAnalyzeItem(item)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-yellow-500/30 text-yellow-400 bg-yellow-500/5 hover:bg-yellow-500/15 transition-colors text-xs font-bold">
                            <Zap className="w-3.5 h-3.5" /> Analyze
                          </button>
                          <button onClick={() => !addedIds.has(item.item_id) && handleAddToPipeline(item)} className={`p-2.5 rounded-xl border transition-colors ${addedIds.has(item.item_id) ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5 cursor-default' : 'text-slate-400 border-slate-700 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5'}`}>
                            {addedIds.has(item.item_id) ? <CheckCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout for Main Listings */}
            <div className="md:hidden divide-y divide-slate-800/50">
              {listings.map(item => (
                <div key={item.item_id} className="p-4 space-y-4">
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-xl bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                      {item.images?.[0] ? (
                        <img src={item.images[0]} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700"><ImageIcon className="w-4 h-4" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-100 truncate mb-1">{item.title}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" /> {item.location?.city || 'Unknown'}
                        </span>
                        {item.condition && (
                          <span className="text-[10px] text-slate-600 uppercase font-black">{item.condition}</span>
                        )}
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold">
                          {t('common.view')} <ExternalLink className="w-2 h-2" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {item.analyzed && (
                    <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50 space-y-3">
                      <div className="flex items-start gap-2">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${item.score >= 80 ? 'bg-emerald-500/10 text-emerald-400' : item.score >= 50 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                          {item.score}
                        </div>
                        {item.verdict && (
                          <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase shrink-0 border ${
                            item.verdict === 'buy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                            item.verdict === 'negotiate' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                            item.verdict === 'filtered' ? 'text-slate-500 bg-slate-800 border-slate-700' :
                            'text-red-400 bg-red-500/10 border-red-500/30'
                          }`}>{item.verdict}</div>
                        )}
                        <div className="text-[11px] text-slate-300 italic leading-relaxed">{item.reason}</div>
                      </div>
                      {item.negotiation_angle && (
                        <div className="text-[10px] text-indigo-300/70 italic pl-2 border-l border-indigo-500/20">
                          {item.negotiation_angle}
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-3 border-t border-slate-700/30 pt-3">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Price</div>
                          <div className="text-sm font-black text-slate-100">{item.price}€</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Target Buy</div>
                          <div className="text-sm font-black text-blue-400">{item.target || '—'}€</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Est. Sale</div>
                          <div className="text-sm font-black text-emerald-400">{item.target_resell || '—'}€</div>
                        </div>
                        {item.net_profit != null && (
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Net Profit</div>
                            <div className={`text-sm font-black ${item.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {item.net_profit >= 0 ? '+' : ''}{item.net_profit}€
                            </div>
                          </div>
                        )}
                        {item.real_margin_pct != null && (
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Margin</div>
                            <div className="text-sm font-black text-slate-300">{item.real_margin_pct.toFixed(1)}%</div>
                          </div>
                        )}
                        {item.time_to_sell && (
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Time to Sell</div>
                            <div className={`text-sm font-black ${item.time_to_sell === 'fast' ? 'text-emerald-400' : item.time_to_sell === 'medium' ? 'text-amber-400' : 'text-slate-400'}`}>
                              {item.time_to_sell}
                            </div>
                          </div>
                        )}
                      </div>
                      {item.red_flags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-700/30">
                          {item.red_flags.map((flag, i) => (
                            <span key={i} className="text-[9px] text-red-400/80 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">⚠ {flag.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => handleAnalyzeItem(item)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 font-bold text-xs border border-slate-700 active:scale-95 transition-transform">Analyze</button>
                    <button 
                      onClick={() => !addedIds.has(item.item_id) && handleAddToPipeline(item)} 
                      className={`flex-1 py-2 rounded-lg font-bold text-xs border active:scale-95 transition-transform ${addedIds.has(item.item_id) ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/30' : 'bg-yellow-600/10 text-yellow-500 border-yellow-500/20'}`}
                    >
                      {addedIds.has(item.item_id) ? 'Added' : 'Add to pipeline'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Market Context & Discarded Section */}
          {discarded.length > 0 && (
            <div className="space-y-4">
              <button 
                onClick={() => setIsDiscardedExpanded(!isDiscardedExpanded)}
                className="w-full flex items-center justify-between px-1 group cursor-pointer"
              >
                <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 group-hover:text-slate-400 transition-colors">
                  <AlertCircle className="w-4 h-4 text-yellow-500/70" /> 
                  {t('discovery.market_context')} / {t('discovery.discarded')}
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-800/50 px-2 py-0.5 rounded-full">{discarded.length} items</span>
                  <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform duration-300 ${isDiscardedExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>
              
              {isDiscardedExpanded && (
                <div className="card border-slate-800/60 bg-slate-900/20 animate-slide-down">
                  {/* Desktop Table for Discarded */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-800/30 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800/50">
                          <th className="py-3 px-6 w-[35%]">Listing</th>
                          <th className="py-3 px-6 w-[40%]">Status / Reason</th>
                          <th className="py-3 px-6 text-center w-[10%]">Price</th>
                          <th className="py-3 px-6 text-right w-[15%]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {discarded.map(d => (
                          <tr key={d.item_id} className="hover:bg-white/[0.01] transition-colors group">
                            <td className="py-3 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-slate-800 overflow-hidden shrink-0 border border-slate-700/50">
                                  {d.images?.[0] && <img src={d.images[0]} className="w-full h-full object-cover opacity-60 grayscale-[50%]" alt="" referrerPolicy="no-referrer" />}
                                </div>
                                <div className="text-xs font-bold text-slate-400 truncate">{d.title}</div>
                              </div>
                            </td>
                            <td className="py-3 px-6 text-[11px] text-slate-500 leading-relaxed italic">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${d.status?.includes('sold') || d.status?.includes('vendido') ? 'bg-red-500/10 text-red-500' : 'bg-slate-800 text-slate-500'}`}>
                                  {d.status || 'irrelevant'}
                                </span>
                              </div>
                              {d.reason}
                            </td>
                            <td className="py-3 px-6 text-center font-black text-slate-300 text-xs">{d.price}€</td>
                            <td className="py-3 px-6 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <a href={d.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-600 hover:text-blue-400" title="View Source">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <button onClick={() => handleAnalyzeItem(d)} className="p-1.5 text-slate-600 hover:text-yellow-400" title="Analyze">
                                  <Zap className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleMoveToMain(d)} className="p-1.5 text-slate-600 hover:text-emerald-400 font-bold" title="Move back to recommendations">
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card Layout for Discarded */}
                  <div className="md:hidden divide-y divide-slate-800/40">
                    {discarded.map(d => (
                       <div key={d.item_id} className="p-4 space-y-3">
                          <div className="flex gap-3">
                            <div className="w-10 h-10 rounded bg-slate-800 overflow-hidden shrink-0 border border-slate-700/50">
                              {d.images?.[0] && <img src={d.images[0]} className="w-full h-full object-cover opacity-50 grayscale" alt="" referrerPolicy="no-referrer" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-400 truncate mb-1">{d.title}</div>
                              <div className="flex items-center justify-between">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${d.status?.includes('sold') || d.status?.includes('vendido') ? 'bg-red-500/10 text-red-500' : 'bg-slate-800 text-slate-500'}`}>
                                  {d.status || 'irrelevant'}
                                </span>
                                <span className="text-xs font-black text-slate-500">{d.price}€</span>
                              </div>
                            </div>
                          </div>
                          {d.reason && (
                            <div className="text-[10px] text-slate-500 italic leading-relaxed pl-1 border-l border-slate-800">
                              {d.reason}
                            </div>
                          )}
                          <div className="flex gap-2">
                             <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 rounded bg-slate-800 text-slate-500 font-bold text-[10px] border border-slate-700 text-center">Source</a>
                             <button onClick={() => handleMoveToMain(d)} className="flex-[2] py-1.5 rounded bg-emerald-600/10 text-emerald-500 font-bold text-[10px] border border-emerald-500/20">Rescue & Move to Main</button>
                          </div>
                       </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loading || analyzing}
                className="btn-secondary px-8 py-3 bg-yellow-500/5 border-yellow-500/20 text-yellow-500 hover:bg-yellow-500/10 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                {loading ? t('common.loading') : t('common.load_more')}
              </button>
            </div>
          )}
        </div>
      ) : !loading && !analyzing && (
        <div className="card p-20 text-center border-dashed border-slate-800 bg-transparent">
          <div className="max-w-sm mx-auto">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-600">
              <Search className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-300 mb-2">{t('discovery.empty_title')}</h3>
            <p className="text-slate-500 text-sm">{t('discovery.empty_desc')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
