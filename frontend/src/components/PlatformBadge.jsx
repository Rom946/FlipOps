const PLATFORM_CONFIG = {
  wallapop:    { emoji: '🟠', label: 'Wallapop',    bg: 'bg-amber-500/15',   text: 'text-amber-400'   },
  vinted:      { emoji: '🟢', label: 'Vinted',      bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  milanuncios: { emoji: '🔵', label: 'Milanuncios', bg: 'bg-blue-500/15',    text: 'text-blue-400'    },
  ebay_es:     { emoji: '🔴', label: 'eBay Spain',  bg: 'bg-red-500/15',     text: 'text-red-400'     },
}

export default function PlatformBadge({ platform }) {
  const cfg = PLATFORM_CONFIG[platform] || { emoji: '⚪', label: 'Unknown', bg: 'bg-slate-500/15', text: 'text-slate-400' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.emoji} {cfg.label}
    </span>
  )
}
