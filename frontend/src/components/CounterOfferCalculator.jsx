// @flipops-map CounterOfferCalculator.jsx — updated 2026-03-15 — Uses named anchors
//
// STRUCTURE:
//   ANCHOR:outer_container  — fixed-position wrapper (pointerEvents:none — never intercepts)
//   ANCHOR:panel            — slide-up calc panel (pointerEvents:auto when open, none when closed)
//   ANCHOR:float_button     — floating 💶 toggle button (pointerEvents:auto)
// STATE:
//   open, role, listed, offer, targetMargin, platformFee (selling mode)
//   sellerListed, maxBuy, expectedResell, buyPlatformFee, buyTargetMargin (buying mode)
// EFFECTS:
//   Escape key → setOpen(false)
//   mousedown outside panelRef → setOpen(false)

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

function marginColor(pct) {
  if (pct === null || isNaN(pct) || !isFinite(pct)) return 'text-slate-400'
  if (pct > 30) return 'text-emerald-400'
  if (pct >= 15) return 'text-amber-400'
  return 'text-red-400'
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(n) || !isFinite(n)) return '—'
  return n.toFixed(2)
}

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition-colors'
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1'

export default function CounterOfferCalculator() {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState('selling')

  // Selling mode
  const [listed, setListed] = useState('')
  const [offer, setOffer] = useState('')
  const [targetMargin, setTargetMargin] = useState('35')
  const [platformFee, setPlatformFee] = useState('10')

  // Buying mode
  const [sellerListed, setSellerListed] = useState('')
  const [maxBuy, setMaxBuy] = useState('')
  const [expectedResell, setExpectedResell] = useState('')
  const [buyPlatformFee, setBuyPlatformFee] = useState('10')
  const [buyTargetMargin, setBuyTargetMargin] = useState('35')

  const panelRef = useRef(null)

  const switchRole = (r) => {
    setRole(r)
    setListed(''); setOffer(''); setTargetMargin('35'); setPlatformFee('10')
    setSellerListed(''); setMaxBuy(''); setExpectedResell(''); setBuyPlatformFee('10'); setBuyTargetMargin('35')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // ── SELLING ──────────────────────────────────────────────
  const listedPrice = parseFloat(listed)
  const buyerOffer  = parseFloat(offer)
  const tm  = parseFloat(targetMargin) || 35
  const fee = parseFloat(platformFee)  || 10

  const boughtPrice = (isFinite(listedPrice) && listedPrice > 0)
    ? listedPrice / (1 + tm / 100)
    : null

  const platformFeeAmt = (isFinite(buyerOffer) && buyerOffer > 0)
    ? buyerOffer * (fee / 100)
    : null

  const netAfterFee = (isFinite(buyerOffer) && buyerOffer > 0 && boughtPrice !== null)
    ? buyerOffer * (1 - fee / 100)
    : null
  const netProfit  = netAfterFee !== null ? netAfterFee - boughtPrice : null
  const realMargin = (netProfit !== null && boughtPrice > 0)
    ? (netProfit / boughtPrice) * 100
    : null

  const minCounterDisplay = (target) => {
    if (boughtPrice === null || boughtPrice <= 0) return { value: null, note: null }
    const mc = (boughtPrice * (1 + target / 100)) / (1 - fee / 100)
    if (isFinite(listedPrice) && listedPrice > 0 && mc > listedPrice)
      return { value: `€${fmt(listedPrice)}`, note: 'Hold your listed price' }
    if (isFinite(buyerOffer) && buyerOffer > 0 && mc <= buyerOffer)
      return { value: null, note: '✅ Offer already meets this target' }
    return { value: `€${fmt(mc)}`, note: null }
  }

  // ── BUYING ───────────────────────────────────────────────
  const bSellerListed   = parseFloat(sellerListed)
  const bMaxBuy         = parseFloat(maxBuy)
  const bExpectedResell = parseFloat(expectedResell)
  const bFee = parseFloat(buyPlatformFee)  || 10
  const bTm  = parseFloat(buyTargetMargin) || 35

  const bNetResell = (isFinite(bExpectedResell) && bExpectedResell > 0)
    ? bExpectedResell * (1 - bFee / 100)
    : null
  const bNetProfit  = (bNetResell !== null && isFinite(bMaxBuy) && bMaxBuy > 0)
    ? bNetResell - bMaxBuy
    : null
  const bRealMargin = (bNetProfit !== null && bMaxBuy > 0)
    ? (bNetProfit / bMaxBuy) * 100
    : null
  const bMaxShouldPay = bNetResell !== null
    ? bNetResell / (1 + bTm / 100)
    : null
  const bNegotiationGap = (isFinite(bSellerListed) && bSellerListed > 0 && bMaxShouldPay !== null)
    ? bSellerListed - bMaxShouldPay
    : null

  const bVerdict = (() => {
    if (bMaxShouldPay === null || !isFinite(bMaxBuy) || bMaxBuy <= 0) return null
    if (bMaxBuy <= bMaxShouldPay)              return { text: '✅ Good deal at this price',           cls: 'text-emerald-400' }
    if (bMaxBuy <= bMaxShouldPay * 1.10)       return { text: '⚠️ Tight margin — negotiate harder',  cls: 'text-amber-400' }
    return                                            { text: '❌ Too expensive at this price',        cls: 'text-red-400' }
  })()

  // ── RENDER ───────────────────────────────────────────────
  return (
    // ANCHOR:outer_container
    <div ref={panelRef} style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 50, pointerEvents: 'none' }}>
      {/* ANCHOR:panel */}
      <div style={{ pointerEvents: open ? 'auto' : 'none' }} className={`mb-3 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden transition-all duration-200 origin-bottom-right ${
        open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2 pointer-events-none'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <span className="text-xs font-black text-slate-100 uppercase tracking-widest">Counter-Offer Calc</span>
          <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">

          {/* Role toggle */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            {['selling', 'buying'].map(r => (
              <button key={r} onClick={() => switchRole(r)}
                className={`flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-md transition-all ${
                  role === r ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                }`}>
                {r === 'selling' ? 'I am selling' : 'I am buying'}
              </button>
            ))}
          </div>

          {role === 'selling' ? (
            <>
              {/* ── SELLING INPUTS ── */}
              <div>
                <div className={labelCls}>My listed price</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">€</span>
                  <input type="number" min="0" value={listed} onChange={e => setListed(e.target.value)}
                    className={inputCls + ' pl-7'} placeholder="0.00" />
                </div>
                {boughtPrice !== null && boughtPrice > 0 && (
                  <div className="text-[10px] text-slate-600 mt-1 px-1">Implied buy price: €{fmt(boughtPrice)}</div>
                )}
              </div>

              <div>
                <div className={labelCls}>Buyer offers</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">€</span>
                  <input type="number" min="0" value={offer} onChange={e => setOffer(e.target.value)}
                    className={inputCls + ' pl-7'} placeholder="0.00" />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <div className={labelCls}>Target margin</div>
                  <div className="relative">
                    <input type="number" min="0" max="100" value={targetMargin} onChange={e => setTargetMargin(e.target.value)}
                      className={inputCls + ' pr-6'} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className={labelCls}>Platform fee</div>
                  <div className="relative">
                    <input type="number" min="0" max="100" value={platformFee} onChange={e => setPlatformFee(e.target.value)}
                      className={inputCls + ' pr-6'} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800" />

              {/* Muted context lines */}
              {(boughtPrice > 0 || platformFeeAmt !== null) && (
                <div className="space-y-0.5">
                  {boughtPrice > 0 && (
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Bought at</span><span>€{fmt(boughtPrice)}</span>
                    </div>
                  )}
                  {platformFeeAmt !== null && (
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Platform fee</span><span>€{fmt(platformFeeAmt)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* If you accept */}
              <div>
                <div className={labelCls}>If you accept</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Net profit</span>
                    <span className={`font-black ${marginColor(realMargin)}`}>€{fmt(netProfit)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Real margin</span>
                    <span className={`font-black ${marginColor(realMargin)}`}>{fmt(realMargin)}%</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800" />

              {/* Minimum counter */}
              <div>
                <div className={labelCls}>Minimum counter</div>
                <div className="space-y-2">
                  {[25, 30, 35].map(target => {
                    const { value, note } = minCounterDisplay(target)
                    const isTarget = target === tm
                    return (
                      <div key={target} className={`text-sm ${isTarget ? 'opacity-100' : 'opacity-55'}`}>
                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            {isTarget && <span className="text-blue-400 mr-1">▸</span>}Keep {target}%
                          </span>
                          <span className="font-black text-slate-200">{value ?? '—'}</span>
                        </div>
                        {note && <div className="text-[10px] text-slate-500 mt-0.5 text-right">{note}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ── BUYING INPUTS ── */}
              <div>
                <div className={labelCls}>Seller listed price</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">€</span>
                  <input type="number" min="0" value={sellerListed} onChange={e => setSellerListed(e.target.value)}
                    className={inputCls + ' pl-7'} placeholder="0.00" />
                </div>
              </div>

              <div>
                <div className={labelCls}>Your max buy price</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">€</span>
                  <input type="number" min="0" value={maxBuy} onChange={e => setMaxBuy(e.target.value)}
                    className={inputCls + ' pl-7'} placeholder="0.00" />
                </div>
              </div>

              <div>
                <div className={labelCls}>Expected resell</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">€</span>
                  <input type="number" min="0" value={expectedResell} onChange={e => setExpectedResell(e.target.value)}
                    className={inputCls + ' pl-7'} placeholder="0.00" />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <div className={labelCls}>Target margin</div>
                  <div className="relative">
                    <input type="number" min="0" max="100" value={buyTargetMargin} onChange={e => setBuyTargetMargin(e.target.value)}
                      className={inputCls + ' pr-6'} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className={labelCls}>Platform fee</div>
                  <div className="relative">
                    <input type="number" min="0" max="100" value={buyPlatformFee} onChange={e => setBuyPlatformFee(e.target.value)}
                      className={inputCls + ' pr-6'} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800" />

              {/* At your max buy price */}
              <div>
                <div className={labelCls}>At your max buy price</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Net profit</span>
                    <span className={`font-black ${marginColor(bRealMargin)}`}>€{fmt(bNetProfit)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Real margin</span>
                    <span className={`font-black ${marginColor(bRealMargin)}`}>{fmt(bRealMargin)}%</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800" />

              {/* Ideal max buy + negotiation gap */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ideal max buy</span>
                  <span className="font-black text-slate-200">€{fmt(bMaxShouldPay)}</span>
                </div>
                {bNegotiationGap !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Negotiation gap</span>
                    <span className="font-black text-slate-200">€{fmt(bNegotiationGap)}</span>
                  </div>
                )}
                {bNegotiationGap !== null && bNegotiationGap > 0 && (
                  <div className="text-[10px] text-slate-600 text-right">
                    You need €{fmt(bNegotiationGap)} off the listed price
                  </div>
                )}
              </div>

              {/* Verdict */}
              {bVerdict && (
                <>
                  <div className="border-t border-slate-800" />
                  <div className={`text-xs font-black ${bVerdict.cls}`}>{bVerdict.text}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ANCHOR:float_button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ pointerEvents: 'auto' }}
        className={`ml-auto flex items-center justify-center w-12 h-12 rounded-full shadow-2xl shadow-black/50 border transition-all duration-150 text-xl ${
          open
            ? 'bg-slate-800 border-slate-600 scale-95'
            : 'bg-slate-900 border-slate-700 hover:border-slate-500 hover:scale-105'
        }`}
      >
        💶
      </button>
    </div>
  )
}
