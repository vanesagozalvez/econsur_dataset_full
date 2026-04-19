const BASE = import.meta.env.VITE_API_URL || ''

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const getRepos = () => api('/api/repos')

export const getFuentes = (repo) => api(`/api/fuentes?repo=${encodeURIComponent(repo)}`)

export const getFrecuencias = (repo, fuente) =>
  api(`/api/frecuencias?repo=${encodeURIComponent(repo)}&fuente=${encodeURIComponent(fuente)}`)

export const getSeries = (repo, fuente, frecuencia) =>
  api(`/api/series?repo=${encodeURIComponent(repo)}&fuente=${encodeURIComponent(fuente)}&frecuencia=${encodeURIComponent(frecuencia)}`)

export const getPeriodos = (repo, fuente, frecuencia, serie, meta_idx) => {
  let url = `/api/periodos?repo=${encodeURIComponent(repo)}&fuente=${encodeURIComponent(fuente)}&frecuencia=${encodeURIComponent(frecuencia)}&serie=${encodeURIComponent(serie)}`
  if (meta_idx !== undefined && meta_idx !== null) url += `&meta_idx=${meta_idx}`
  return api(url)
}

export const buildDataset = (payload) =>
  api('/api/dataset/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const exportDatasetCsv = async (payload) => {
  const res = await fetch(`${BASE}/api/dataset/export/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Error exportando CSV')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `econsur_${payload.nombre.replace(/\s+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
