import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'flipops_pipeline'

const STATUS_ORDER = ['Watching', 'Negotiating', 'Bought', 'Listed', 'Sold']

function generateId() {
  return `deal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function usePipeline() {
  const [deals, setDeals] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return []
      const parsed = JSON.parse(stored)
      
      // Cleanup: Remove deals sold > 15 days ago
      const fifteenDaysAgo = new Date()
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15)
      
      return parsed.filter(deal => {
        if (deal.status === 'Sold' && deal.sold_at) {
          return new Date(deal.sold_at) > fifteenDaysAgo
        }
        return true
      })
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals))
  }, [deals])

  const addDeal = useCallback((dealData) => {
    const newDeal = {
      id: generateId(),
      product: dealData.product || dealData.title || 'Unknown Product',
      initial_price: parseFloat(dealData.initial_price || dealData.price || 0),
      target_buy: parseFloat(dealData.target_buy || 0),
      actual_buy: parseFloat(dealData.actual_buy || dealData.buy_price || 0),
      target_sell: parseFloat(dealData.target_sell || 0),
      actual_sell: parseFloat(dealData.actual_sell || 0),
      status: dealData.status || 'Watching',
      url: dealData.url || dealData.listing_url || '',
      slug: dealData.slug || '',
      notes: dealData.notes || '',
      chat_history: dealData.chat_history || '',
      analysis: dealData.analysis || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setDeals(prev => [newDeal, ...prev])
    return newDeal
  }, [])

  const updateDeal = useCallback((id, updates) => {
    setDeals(prev => prev.map(deal => {
      if (deal.id === id) {
        const newUpdates = { ...updates, updated_at: new Date().toISOString() }
        if (updates.status === 'Sold' && deal.status !== 'Sold' && !deal.sold_at) {
          newUpdates.sold_at = new Date().toISOString()
        }
        return { ...deal, ...newUpdates }
      }
      return deal
    }))
  }, [])

  const deleteDeal = useCallback((id) => {
    setDeals(prev => prev.filter(deal => deal.id !== id))
  }, [])

  const stats = {
    totalDeals: deals.length,
    soldDeals: deals.filter(d => d.status === 'Sold').length,
    activeDeals: deals.filter(d => ['Watching', 'Negotiating', 'Bought', 'Listed'].includes(d.status)).length,
    totalProfit: deals
      .filter(d => d.status === 'Sold' && d.actual_sell && (d.actual_buy || d.buy_price))
      .reduce((sum, d) => sum + (d.actual_sell - (d.actual_buy || d.buy_price || 0)), 0),
    totalRevenue: deals
      .filter(d => d.status === 'Sold')
      .reduce((sum, d) => sum + (d.actual_sell || 0), 0),
    capitalDeployed: deals
      .filter(d => ['Bought', 'Listed'].includes(d.status))
      .reduce((sum, d) => sum + (d.actual_buy || d.buy_price || 0), 0),
  }

  const soldWithMargin = deals.filter(d => d.status === 'Sold' && d.actual_sell && (d.actual_buy || d.buy_price))
  stats.avgMargin = soldWithMargin.length > 0
    ? soldWithMargin.reduce((sum, d) => {
        const cost = d.actual_buy || d.buy_price || 0
        return sum + (cost > 0 ? ((d.actual_sell - cost) / cost * 100) : 0)
      }, 0) / soldWithMargin.length
    : 0

  return { deals, addDeal, updateDeal, deleteDeal, stats, STATUS_ORDER }
}
