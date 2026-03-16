import { auth } from '../firebase'

const API_URL = import.meta.env.VITE_API_URL || ''

async function apiFetch(path, options = {}) {
  const user = auth.currentUser
  const token = user ? await user.getIdToken() : null
  
  const headers = { 
    'Content-Type': 'application/json', 
    ...options.headers 
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = `${API_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers,
  })
  
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch (e) {
    throw new Error(`Invalid JSON from server. Status: ${res.status}. Body: ${text.substring(0, 100)}...`)
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export function useApi() {
  return {
    importListing: (url) =>
      apiFetch('/api/import', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),

    scoreDeals: (results) =>
      apiFetch('/api/score-deals', {
        method: 'POST',
        body: JSON.stringify({ results }),
      }),

    analyzeListing: (body) =>
      apiFetch('/api/analyze-listing', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    generateListing: (body) =>
      apiFetch('/api/generate-listing', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      
    getMe: () => apiFetch('/api/user/me'),
    
    setApiKey: (api_key) => apiFetch('/api/user/api-key', {
      method: 'POST',
      body: JSON.stringify({ api_key })
    }),
    
    deleteApiKey: () => apiFetch('/api/user/api-key', {
      method: 'DELETE'
    }),
    
    updateSettings: (settings) => apiFetch('/api/user/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings)
    }),
    
    getHistory: () => apiFetch('/api/user/history'),
    saveHistory: (data) => apiFetch('/api/user/history', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    
    discover: (keywords, location, page = 1, platforms = ['wallapop']) => apiFetch('/api/discovery', {
      method: 'POST',
      body: JSON.stringify({ keywords, location, page, platforms })
    }),
    batchAnalyze: (items, keywords) => apiFetch('/api/batch-analyze', {
      method: 'POST',
      body: JSON.stringify({ items, keywords })
    }),
    
    // Admin routes
    getPreauthorized: () => apiFetch('/api/admin/preauthorized'),
    addPreauthorized: (data) => apiFetch('/api/admin/preauthorized', { method: 'POST', body: JSON.stringify(data) }),
    deletePreauthorized: (id) => apiFetch(`/api/admin/preauthorized/${id}`, { method: 'DELETE' }),
    getAdminStats: () => apiFetch('/api/admin/stats'),
    getAdminUsers: () => apiFetch('/api/admin/users'),
    updateUser: (uid, data) => apiFetch(`/api/admin/users/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
    setSharedKey: (api_key) => apiFetch('/api/admin/set-key', {
      method: 'POST',
      body: JSON.stringify({ api_key })
    }),
    getAppConfig: () => apiFetch('/api/admin/app-config'),
    updateAppConfig: (section, data) => apiFetch('/api/admin/app-config', {
      method: 'PATCH',
      body: JSON.stringify({ section, data })
    }),
    
    updatePlatformPreference: (platform, enabled) => apiFetch('/api/user/platform-preferences', {
      method: 'PATCH',
      body: JSON.stringify({ platform, enabled })
    }),

    getKeywordVariants: () => apiFetch('/api/user/keyword-variants'),
    createKeywordVariant: (data) => apiFetch('/api/user/keyword-variants', { method: 'POST', body: JSON.stringify(data) }),
    updateKeywordVariant: (id, data) => apiFetch(`/api/user/keyword-variants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteKeywordVariant: (id) => apiFetch(`/api/user/keyword-variants/${id}`, { method: 'DELETE' }),

    geocode: (q) => apiFetch(`/api/geocoder?q=${encodeURIComponent(q)}`),

    generateDiscussion: (data) => apiFetch('/api/discussion/generate', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    getAppointments: () => apiFetch('/api/appointments'),
    createAppointment: (data, headers) => apiFetch('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
      headers
    }),
    updateAppointment: (id, data) => apiFetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
    deleteAppointment: (id, headers) => apiFetch(`/api/appointments/${id}`, {
      method: 'DELETE',
      headers
    }),
  }
}
