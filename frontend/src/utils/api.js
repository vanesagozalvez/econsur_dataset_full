// En producción VITE_API_URL está vacío → usa rutas relativas (mismo dominio)
const BASE = import.meta.env.VITE_API_URL || ''

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const getRepos      = ()                          => api('/api/repos')
export const getFuentes    = (repo)                      => api(`/api/fuentes?repo=${enc(repo)}`)
export const getFrecuencias= (repo, fuente)              => api(`/api/frecuencias?repo=${enc(repo)}&fuente=${enc(fuente)}`)
export const getSeries     = (repo, fuente, frecuencia)  => api(`/api/series?repo=${enc(repo)}&fuente=${enc(fuente)}&frecuencia=${enc(frecuencia)}`)

export const getPeriodos = (repo, fuente, frecuencia, serie, meta_idx) => {
  let url = `/api/periodos?repo=${enc(repo)}&fuente=${enc(fuente)}&frecuencia=${enc(frecuencia)}&serie=${enc(serie)}`
  if (meta_idx != null) url += `&meta_idx=${meta_idx}`
  return api(url)
}

export const buildDataset = (payload) =>
  api('/api/dataset/build', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })

export const exportDatasetCsv = async (payload) => {
  const res = await fetch(`${BASE}/api/dataset/export/csv`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Error exportando CSV')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `econsur_${payload.nombre.replace(/\s+/g,'_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const enc = encodeURIComponent
