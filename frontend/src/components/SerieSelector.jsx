import { useState, useEffect } from 'react'
import { getFuentes, getFrecuencias, getSeries } from '../utils/api'

const REPOS = [
  { value:'macro',    label:'Macroeconomía INDEC' },
  { value:'comercio', label:'Comercio Exterior ICA' },
  { value:'empleo',   label:'Empleo e Ingresos' },
  { value:'precios',  label:'Precios IPC' },
]

const S = { background:'var(--ink-800)', border:'1px solid var(--ink-700)',
            color:'#c8c8d8', borderRadius:8, padding:'6px 10px', fontSize:13, width:'100%' }

export default function SerieSelector({ index, onSelect, globalFreq }) {
  const [repo,       setRepo]       = useState('')
  const [fuentes,    setFuentes]    = useState([])
  const [fuente,     setFuente]     = useState('')
  const [frecuencias,setFrecuencias]= useState([])
  const [frecuencia, setFrecuencia] = useState('')
  const [series,     setSeries]     = useState([])
  const [serie,      setSerie]      = useState(null)
  const [label,      setLabel]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  // Sync con frecuencia global
  useEffect(() => {
    if (globalFreq && frecuencias.includes(globalFreq) && frecuencia !== globalFreq) {
      loadSeries(fuente, globalFreq)
    }
  }, [globalFreq])

  const reset = (level) => {
    if (level <= 1) { setFuente(''); setFuentes([]) }
    if (level <= 2) { setFrecuencias([]); setFrecuencia('') }
    if (level <= 3) { setSeries([]); setSerie(null) }
    setError('')
  }

  const onRepo = async (r) => {
    setRepo(r); reset(1)
    setLoading(true)
    try {
      const data = await getFuentes(r)
      setFuentes(data.filter(f => f.available !== false))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const onFuente = async (f) => {
    setFuente(f); reset(2)
    setLoading(true)
    try {
      const data = await getFrecuencias(repo, f)
      setFrecuencias(data)
      const match = globalFreq && data.includes(globalFreq) ? globalFreq : data[0]
      if (match) await loadSeries(f, match)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const loadSeries = async (fVal, frVal) => {
    setFrecuencia(frVal); setSeries([]); setSerie(null)
    setLoading(true)
    try {
      const data = await getSeries(repo, fVal || fuente, frVal)
      setSeries(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const onSerie = (s) => {
    setSerie(s)
    if (!label) setLabel(s.serie_nombre.slice(0, 42))
  }

  const handleAdd = () => {
    if (!serie || !label.trim()) return
    onSelect({
      repo, fuente, frecuencia,
      serie:       serie.serie_nombre_original || serie.serie_nombre,
      serie_nombre:serie.serie_nombre,
      label:       label.trim(),
      meta_idx:    serie.meta_idx ?? null,
      unidad:      serie.unidad || '',
    })
    // Reset para siguiente selección
    setSerie(null); setLabel('')
  }

  const fKey   = f => f.fuente || f.cuadro || ''
  const fLabel = f => f.nombre || f.fuente_nombre || f.cuadro_nombre || f.cuadro || ''

  return (
    <div className="rounded-xl p-4 space-y-2.5 fade-up"
         style={{ background:'var(--ink-900)', border:'1px solid var(--ink-700)' }}>

      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-mono font-bold"
              style={{ background:'var(--ink-700)', color:'var(--gold)' }}>{index + 1}</span>
        <span className="text-xs" style={{ color:'#55556a' }}>Serie</span>
        {loading && <span className="text-xs pulse-dot ml-auto" style={{ color:'#44446a' }}>cargando…</span>}
      </div>

      {/* Fuente de datos */}
      <select value={repo} onChange={e => onRepo(e.target.value)} style={S}>
        <option value="">— Fuente de datos —</option>
        {REPOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>

      {/* Cuadro / Fuente */}
      {repo && (
        <select value={fuente} onChange={e => onFuente(e.target.value)} style={S} disabled={loading}>
          <option value="">— Cuadro / Fuente —</option>
          {fuentes.map(f => <option key={fKey(f)} value={fKey(f)}>{fLabel(f)}</option>)}
        </select>
      )}

      {/* Frecuencia */}
      {fuente && frecuencias.length > 0 && (
        <select value={frecuencia} onChange={e => loadSeries(fuente, e.target.value)} style={S} disabled={loading}>
          {frecuencias.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      )}

      {/* Serie */}
      {series.length > 0 && (
        <select
          value={serie?.serie_id || ''}
          onChange={e => { const s = series.find(x => x.serie_id === e.target.value); if (s) onSerie(s) }}
          style={S}
        >
          <option value="">— Seleccionar serie ({series.length}) —</option>
          {series.map(s => <option key={s.serie_id} value={s.serie_id}>{s.serie_nombre}</option>)}
        </select>
      )}

      {/* Label + agregar */}
      {serie && (
        <div className="flex gap-2">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Nombre en el dataset…"
            style={{ ...S, flex:1, padding:'6px 10px' }}
          />
          <button
            onClick={handleAdd}
            disabled={!label.trim()}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity"
            style={{ background:'var(--gold)', color:'#000', whiteSpace:'nowrap' }}
          >+ Agregar</button>
        </div>
      )}

      {error && <p className="text-xs" style={{ color:'var(--coral)' }}>{error}</p>}
    </div>
  )
}
