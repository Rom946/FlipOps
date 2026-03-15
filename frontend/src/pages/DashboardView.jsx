import { useState, useMemo } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  Title, Tooltip, Legend
} from 'chart.js'
import { BarChart2, TrendingUp, DollarSign, Package, Percent, Download as DownloadIcon, Calculator, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend)

function MetricCard({ icon: Icon, label, value, sub, color = 'text-blue-400' }) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-slate-700/50 flex items-center justify-center">
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function DashboardView({ pipeline }) {
  const { deals, stats } = pipeline
  const { t } = useTranslation()
  const [showCalculator, setShowCalculator] = useState(false)
  const [calc, setCalc] = useState({ buy: '', target: '' })

  const soldDealsByDate = useMemo(() => {
    return deals
      .filter(d => d.status === 'Sold' && d.sold_at && d.buy_price && d.actual_sell)
      .sort((a, b) => new Date(a.sold_at) - new Date(b.sold_at))
  }, [deals])

  const exportCSV = () => {
    if (!deals.length) return
    const headers = ['Product', 'Status', 'Buy Price', 'Sell Price', 'Profit', 'Margin %', 'Bought At', 'Sold At']
    const rows = deals.map(d => {
      const sell = d.status === 'Sold' ? d.actual_sell : d.target_sell
      const profit = (parseFloat(sell) || 0) - (parseFloat(d.buy_price) || 0)
      const margin = (parseFloat(d.buy_price) || 0) > 0 ? (profit / d.buy_price * 100).toFixed(1) : '0'
      return [
        `"${d.product}"`,
        d.status,
        d.buy_price,
        sell,
        profit.toFixed(2),
        margin,
        d.created_at || '',
        d.sold_at || ''
      ].join(',')
    })
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `flipops_report_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const lineChartData = useMemo(() => {
    if (!soldDealsByDate.length) return null
    let cumulative = 0
    const data = soldDealsByDate.map(d => {
      cumulative += (parseFloat(d.actual_sell) - parseFloat(d.buy_price))
      return cumulative
    })
    return {
      labels: soldDealsByDate.map(d => new Date(d.sold_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Cumulative Profit (€)',
        data,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#3b82f6',
      }]
    }
  }, [soldDealsByDate])

  const soldDeals = deals.filter(d => d.status === 'Sold' && d.buy_price)

  const chartData = useMemo(() => {
    if (!soldDeals.length) return null
    const labels = soldDeals.map(d => d.product.slice(0, 20) + (d.product.length > 20 ? '…' : ''))
    const profits = soldDeals.map(d => {
      const sell = parseFloat(d.actual_sell) || parseFloat(d.target_sell) || 0
      return parseFloat((sell - parseFloat(d.buy_price)).toFixed(2))
    })
    return {
      labels,
      datasets: [{
        label: 'Profit (€)',
        data: profits,
        backgroundColor: profits.map(p => p >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
        borderColor: profits.map(p => p >= 0 ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'),
        borderWidth: 1,
        borderRadius: 6,
      }],
    }
  }, [soldDeals])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `  ${ctx.raw >= 0 ? '+' : ''}${ctx.raw}€`,
        },
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
      },
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8', font: { size: 11 } },
        grid: { color: 'rgba(51,65,85,0.5)' },
      },
      y: {
        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => `${v}€` },
        grid: { color: 'rgba(51,65,85,0.5)' },
      },
    },
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-header mb-0">
          <BarChart2 className="w-5 h-5 text-blue-400" />
          <span>{t('dashboard.header')}</span>
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCalculator(true)} className="btn-secondary py-1.5 px-3 text-xs bg-indigo-500/5 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/10">
            <Calculator className="w-4 h-4" /> {t('dashboard.calc')}
          </button>
          <button onClick={exportCSV} className="btn-secondary py-1.5 px-3 text-xs">
            <DownloadIcon className="w-4 h-4" /> {t('dashboard.export_csv')}
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={DollarSign}
          label={t('dashboard.metric_profit')}
          value={`${stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toFixed(0)}€`}
          sub={t('dashboard.metric_profit_sub', { count: stats.soldDeals })}
          color={stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <MetricCard
          icon={TrendingUp}
          label={t('dashboard.metric_revenue')}
          value={`${stats.totalRevenue.toFixed(0)}€`}
          sub={t('dashboard.metric_revenue_sub')}
          color="text-blue-400"
        />
        <MetricCard
          icon={Package}
          label={t('dashboard.metric_capital')}
          value={`${stats.capitalDeployed.toFixed(0)}€`}
          sub={t('dashboard.metric_capital_sub')}
          color="text-amber-400"
        />
        <MetricCard
          icon={Percent}
          label={t('dashboard.metric_margin')}
          value={`${stats.avgMargin.toFixed(1)}%`}
          sub={t('dashboard.metric_margin_sub')}
          color={stats.avgMargin >= 20 ? 'text-emerald-400' : 'text-slate-300'}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {lineChartData ? (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">{t('dashboard.chart_growth')}</h2>
            <div style={{ height: '280px' }}>
              <Line data={lineChartData} options={chartOptions} />
            </div>
          </div>
        ) : (
          <div className="card p-10 text-center flex flex-col justify-center items-center">
             <BarChart2 className="w-10 h-10 text-slate-700 mb-3" />
             <p className="text-slate-500 text-sm">{t('dashboard.no_growth_data')}</p>
          </div>
        )}

        {chartData ? (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">{t('dashboard.chart_per_deal')}</h2>
            <div style={{ height: '280px' }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>
        ) : (
          <div className="card p-10 text-center flex flex-col justify-center items-center">
             <BarChart2 className="w-10 h-10 text-slate-700 mb-3" />
             <p className="text-slate-500 text-sm">{t('dashboard.no_deal_data')}</p>
          </div>
        )}
      </div>

      {/* Calculator Widget */}
      {showCalculator && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in-up">
          <div className="card w-72 p-5 shadow-2xl border-blue-500/30 bg-surface-900 ring-1 ring-blue-500/20">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2 text-blue-400">
                <Calculator className="w-4 h-4" /> {t('dashboard.calc_title')}
              </h3>
              <button onClick={() => setShowCalculator(false)} className="text-slate-500 hover:text-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">{t('dashboard.calc_buy')}</label>
                <input
                  type="number"
                  className="input py-1.5 text-sm"
                  value={calc.buy}
                  onChange={e => setCalc({...calc, buy: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-700/50">
                <div className="p-2 bg-blue-500/5 rounded">
                  <div className="text-[10px] text-slate-500 font-bold">{t('dashboard.calc_resell')}</div>
                  <div className="text-sm font-black text-blue-400">
                    {calc.buy ? Math.round(Number(calc.buy) * 1.35 / 5) * 5 : '0'}€
                  </div>
                </div>
                <div className="p-2 bg-emerald-500/5 rounded">
                  <div className="text-[10px] text-slate-500 font-bold">{t('dashboard.calc_margin')}</div>
                  <div className="text-sm font-black text-emerald-400">
                    {calc.buy ? (Math.round(Number(calc.buy) * 1.35 / 5) * 5 - Number(calc.buy)) : '0'}€
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">{t('dashboard.calc_manual')}</label>
                <input
                  type="number"
                  className="input py-1.5 text-sm"
                  value={calc.target}
                  onChange={e => setCalc({...calc, target: e.target.value})}
                />
              </div>
              {calc.buy && calc.target && (
                <div className="p-3 bg-surface-800 rounded-lg text-center">
                  <div className="text-xs text-slate-400 mb-1">{t('dashboard.calc_roi')}</div>
                  <div className={`text-lg font-black ${((calc.target - calc.buy) / calc.buy * 100) >= 20 ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {((calc.target - calc.buy) / calc.buy * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deals table */}
      {deals.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h2 className="text-sm font-semibold text-slate-300">{t('dashboard.all_deals', { count: deals.length })}</h2>
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700/50">
                  {[t('dashboard.col_product'), t('dashboard.col_status'), t('dashboard.col_buy'), t('dashboard.col_sell'), t('dashboard.col_profit'), t('dashboard.col_margin')].map(h => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => {
                  const bought = parseFloat(deal.buy_price) || 0
                  const sell = deal.status === 'Sold'
                    ? (parseFloat(deal.actual_sell) || 0)
                    : (parseFloat(deal.target_sell) || 0)
                  const profit = sell - bought
                  const margin = bought > 0 ? ((profit / bought) * 100).toFixed(1) : '—'
                  const profitColor = profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-red-400' : 'text-slate-500'
                  const StatusColors = {
                    Watching: 'bg-slate-500/20 text-slate-400', Negotiating: 'bg-purple-500/20 text-purple-400',
                    Bought: 'bg-blue-500/20 text-blue-400', Listed: 'bg-amber-500/20 text-amber-400', Sold: 'bg-emerald-500/20 text-emerald-400',
                  }
                  return (
                    <tr key={deal.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="py-3 px-4 text-sm text-slate-200">{deal.product}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${StatusColors[deal.status]}`}>{deal.status}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-300">{bought > 0 ? `${bought}€` : '—'}</td>
                      <td className="py-3 px-4 text-sm text-slate-300">{sell > 0 ? `${sell}€` : '—'} {deal.status !== 'Sold' && sell > 0 && <span className="text-xs text-slate-600">(target)</span>}</td>
                      <td className={`py-3 px-4 text-sm font-semibold ${profitColor}`}>{bought > 0 && sell > 0 ? `${profit >= 0 ? '+' : ''}${profit.toFixed(0)}€` : '—'}</td>
                      <td className={`py-3 px-4 text-sm ${profitColor}`}>{margin !== '—' ? `${margin}%` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-slate-700/30">
            {deals.map(deal => {
              const bought = parseFloat(deal.buy_price) || 0
              const sell = deal.status === 'Sold'
                ? (parseFloat(deal.actual_sell) || 0)
                : (parseFloat(deal.target_sell) || 0)
              const profit = sell - bought
              const margin = bought > 0 ? ((profit / bought) * 100).toFixed(1) : '—'
              const profitColor = profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-red-400' : 'text-slate-500'
              const StatusColors = {
                Watching: 'bg-slate-500/20 text-slate-400', Negotiating: 'bg-purple-500/20 text-purple-400',
                Bought: 'bg-blue-500/20 text-blue-400', Listed: 'bg-amber-500/20 text-amber-400', Sold: 'bg-emerald-500/20 text-emerald-400',
              }
              return (
                <div key={deal.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-200 truncate">{deal.product}</div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${StatusColors[deal.status]}`}>{deal.status}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${profitColor}`}>
                      {bought > 0 && sell > 0 ? `${profit >= 0 ? '+' : ''}${profit.toFixed(0)}€` : '—'}
                    </div>
                    <div className={`text-xs ${profitColor}`}>{margin !== '—' ? `${margin}%` : '—'}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
