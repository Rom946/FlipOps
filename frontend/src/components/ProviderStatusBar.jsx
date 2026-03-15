import React from 'react'
import { useTranslation } from 'react-i18next'

const PROVIDERS = ['scrapingdog', 'serpapi', 'serper']
const PROVIDER_LABELS = {
  scrapingdog: 'Scrapingdog',
  serpapi: 'SerpAPI',
  serper: 'Serper',
}
const PROVIDER_SHORT = {
  scrapingdog: 'sd',
  serpapi: 'sp',
  serper: 'sr',
}

const getStatusColor = (provider) => {
  if (!provider?.enabled) return '#E24B4A'
  const pct = provider.used / provider.limit
  if (pct >= 0.8) return '#BA7517'
  return '#639922'
}

const formatResets = (resets) => {
  if (resets === 'monthly') return 'mo'
  return ''
}

export default function ProviderStatusBar({ providerStatus, lastScanCounts, lastScanTotal }) {
  const { t } = useTranslation()

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: '0.5rem',
      padding: '8px 12px',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '8px 12px',
      fontSize: '12px',
    }}>
      {PROVIDERS.map((key, i) => (
        <React.Fragment key={key}>
          {i > 0 && (
            <div className="provider-divider" style={{
              width: '0.5px',
              height: '14px',
              background: 'var(--color-border)',
              flexShrink: 0,
            }} />
          )}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: getStatusColor(providerStatus?.[key]),
              display: 'inline-block',
            }} />
            <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>
              {PROVIDER_LABELS[key]}
            </span>
            {providerStatus?.[key]?.enabled
              ? <>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary, #e2e8f0)' }}>
                    {providerStatus[key].used}/{providerStatus[key].limit}
                  </span>
                  {formatResets(providerStatus[key].resets) && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      {formatResets(providerStatus[key].resets)}
                    </span>
                  )}
                </>
              : <span style={{ fontWeight: 500, color: 'var(--color-text-primary, #e2e8f0)' }}>–</span>
            }
          </div>
        </React.Fragment>
      ))}

      {lastScanTotal > 0 && (
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            {t('discovery.lastScan')}: {lastScanTotal}
          </span>
          {Object.entries(lastScanCounts).filter(([k]) => PROVIDER_SHORT[k]).length > 0 && (
            <div style={{
              background: 'rgba(59,130,246,0.1)',
              color: '#93c5fd',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '0.5rem',
            }}>
              {Object.entries(lastScanCounts)
                .filter(([k]) => PROVIDER_SHORT[k])
                .map(([k, v]) => `${PROVIDER_SHORT[k]} ${v}`)
                .join(' · ')
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}
