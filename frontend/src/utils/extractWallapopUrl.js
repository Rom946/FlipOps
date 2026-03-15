/**
 * extractWallapopUrl — extract and normalize a Wallapop URL from arbitrary text.
 *
 * Examples:
 *   Input: "Look what I just found on Wallapop!\nTV Samsung\nhttps://wallapop.com/item/tv-samsung-1217504521?utm_medium=AppShare"
 *   Output: { url: "https://es.wallapop.com/item/tv-samsung-1217504521", wasExtracted: true }
 *
 *   Input: "https://es.wallapop.com/item/iphone-14-pro-12345"
 *   Output: { url: "https://es.wallapop.com/item/iphone-14-pro-12345", wasExtracted: false }
 *
 *   Input: "https://es.wallapop.com/item/iphone-14-pro-12345?utm_source=share"
 *   Output: { url: "https://es.wallapop.com/item/iphone-14-pro-12345", wasExtracted: true }
 *
 *   Input: "some random text without a url"
 *   Output: { url: null, wasExtracted: false }
 */

export function extractWallapopUrl(text) {
  if (!text || typeof text !== 'string') return { url: null, wasExtracted: false }

  const trimmed = text.trim()

  // Check if the entire input is already a clean Wallapop URL (no extraction needed)
  const isCleanUrl = /^https?:\/\/[^\s]+wallapop\.com\/item\/[^?#\s]+$/.test(trimmed)
  if (isCleanUrl) return { url: normalizeUrl(trimmed), wasExtracted: false }

  // Extract first URL from text
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const matches = trimmed.match(urlRegex)
  if (!matches) return { url: null, wasExtracted: false }

  // Find the first Wallapop URL
  const wallapopUrl = matches.find(u => u.includes('wallapop.com'))
  if (!wallapopUrl) return { url: null, wasExtracted: false }

  return { url: normalizeUrl(wallapopUrl), wasExtracted: true }
}

function normalizeUrl(url) {
  // Replace wallapop.com with es.wallapop.com
  let normalized = url.replace(/https?:\/\/(www\.)?wallapop\.com/, 'https://es.wallapop.com')
  // Strip query params and hash
  normalized = normalized.split('?')[0].split('#')[0]
  // Strip trailing slash
  normalized = normalized.replace(/\/$/, '')
  return normalized
}
