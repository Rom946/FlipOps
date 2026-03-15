import { Search, Zap, MessageSquare, Tag, Layers, BarChart2, MapPin, Key, Globe, ChevronRight, Sparkles, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const colorMap = {
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    dot: 'bg-blue-500' },
  yellow:  { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/20',  dot: 'bg-yellow-500' },
  indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20',  dot: 'bg-indigo-500' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
  purple:  { bg: 'bg-purple-500/10',  text: 'text-purple-400',  border: 'border-purple-500/20',  dot: 'bg-purple-500' },
  pink:    { bg: 'bg-pink-500/10',    text: 'text-pink-400',    border: 'border-pink-500/20',    dot: 'bg-pink-500' },
  orange:  { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20',  dot: 'bg-orange-500' },
  teal:    { bg: 'bg-teal-500/10',    text: 'text-teal-400',    border: 'border-teal-500/20',    dot: 'bg-teal-500' },
}

export default function HowToView() {
  const { t } = useTranslation()

  const steps = [
    {
      icon: Search, color: 'blue',
      title: t('howto.s1_title'), path: t('howto.s1_path'),
      summary: t('howto.s1_summary'),
      steps: [t('howto.s1_step1'), t('howto.s1_step2'), t('howto.s1_step3'), t('howto.s1_step4'), t('howto.s1_step5'), t('howto.s1_step6')],
      tip: t('howto.s1_tip'),
    },
    {
      icon: Zap, color: 'yellow',
      title: t('howto.s2_title'), path: t('howto.s2_path'),
      summary: t('howto.s2_summary'),
      steps: [t('howto.s2_step1'), t('howto.s2_step2'), t('howto.s2_step3'), t('howto.s2_step4'), t('howto.s2_step5')],
      tip: t('howto.s2_tip'),
    },
    {
      icon: MessageSquare, color: 'indigo',
      title: t('howto.s3_title'), path: t('howto.s3_path'),
      summary: t('howto.s3_summary'),
      steps: [t('howto.s3_step1'), t('howto.s3_step2'), t('howto.s3_step3'), t('howto.s3_step4')],
      tip: t('howto.s3_tip'),
    },
    {
      icon: Tag, color: 'emerald',
      title: t('howto.s4_title'), path: t('howto.s4_path'),
      summary: t('howto.s4_summary'),
      steps: [t('howto.s4_step1'), t('howto.s4_step2'), t('howto.s4_step3'), t('howto.s4_step4')],
      tip: t('howto.s4_tip'),
    },
    {
      icon: Layers, color: 'purple',
      title: t('howto.s5_title'), path: t('howto.s5_path'),
      summary: t('howto.s5_summary'),
      steps: [t('howto.s5_step1'), t('howto.s5_step2'), t('howto.s5_step3'), t('howto.s5_step4')],
      tip: t('howto.s5_tip'),
    },
    {
      icon: BarChart2, color: 'pink',
      title: t('howto.s6_title'), path: t('howto.s6_path'),
      summary: t('howto.s6_summary'),
      steps: [t('howto.s6_step1'), t('howto.s6_step2'), t('howto.s6_step3')],
      tip: t('howto.s6_tip'),
    },
    {
      icon: Sparkles, color: 'orange',
      title: t('howto.s7_title'), path: t('howto.s7_path'),
      summary: t('howto.s7_summary'),
      steps: [t('howto.s7_step1'), t('howto.s7_step2'), t('howto.s7_step3'), t('howto.s7_step4')],
      tip: t('howto.s7_tip'),
    },
    {
      icon: MessageCircle, color: 'teal',
      title: t('howto.s8_title'), path: t('howto.s8_path'),
      summary: t('howto.s8_summary'),
      steps: [t('howto.s8_step1'), t('howto.s8_step2'), t('howto.s8_step3'), t('howto.s8_step4')],
      tip: t('howto.s8_tip'),
    },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-black text-slate-100 mb-2">{t('howto.header')}</h1>
        <p className="text-slate-400 max-w-xl">
          {t('howto.subtitle')}
        </p>
      </div>

      {/* Quick setup banner */}
      <div className="card p-5 mb-10 border-amber-500/20 bg-amber-500/[0.03] flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex gap-3 items-start sm:items-center flex-1">
          <Key className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <div className="font-bold text-slate-100 text-sm">{t('howto.setup_title')}</div>
            <div className="text-slate-400 text-xs mt-0.5">
              {t('howto.setup_desc')}
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-center text-xs text-slate-500 shrink-0">
          <Globe className="w-4 h-4" /> Language
          <ChevronRight className="w-3 h-3" />
          <MapPin className="w-4 h-4" /> Locations
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {steps.map((section, i) => {
          const c = colorMap[section.color]
          const Icon = section.icon
          return (
            <div key={i} className={`card p-6 border ${c.border}`}>
              <div className="flex items-start gap-4 mb-5">
                <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${c.text}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className={`text-base font-black ${c.text}`}>{section.title}</h2>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 bg-slate-800 px-2 py-0.5 rounded">
                      {section.path}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm mt-1">{section.summary}</p>
                </div>
              </div>

              <ol className="space-y-2 mb-4 pl-1">
                {section.steps.map((step, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-slate-300">
                    <span className={`w-5 h-5 rounded-full ${c.bg} ${c.text} text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5`}>
                      {j + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>

              <div className={`text-xs ${c.text} ${c.bg} rounded-lg px-3 py-2 border ${c.border} flex items-start gap-2`}>
                <span className="font-black uppercase tracking-widest shrink-0">{t('howto.tip_label')}</span>
                <span className="text-slate-300">{section.tip}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
