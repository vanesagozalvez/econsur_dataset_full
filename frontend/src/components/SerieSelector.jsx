import { useState, useEffect } from 'react'
import { getFuentes, getFrecuencias, getSeries, getPeriodos } from '../utils/api'

const REPO_OPTIONS = [
  { value: 'macro',    label: 'Macroeconomía INDEC' },
  { value: 'comercio', label: 'Comercio Exterior ICA' },
  { value: 'empleo',   label: 'Empleo e Ingresos' },
  { value: 'precios',  label: 'Precios IPC' },
]

const selectClass = `w-full bg-transparent border rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1`
const selectStyle = { background: '#1a1a24', borderColor: '#32324e', color: '#c8c8d8' }
const selectFocusRing = { '--tw-ring-color': '#e8a820' }

export default function SerieSelector({ index, onSelect, globalFreq, globalDesde, globalHasta }) {
  const [repo, setRepo] = useState('')
  const [fuentes, setFuentes] = useState([])
  const [fuente, setFuente] = useState('')
  const [frecuencias, setFrecuencias] = useState([])
  const [frecuencia, setFrecuencia] = useState('')
  const [series, setSeries] = useState([])
  const [serie, setSerie] = useState(null)  // full serie object
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // When global freq changes, reset frecuencia
  useEffect(() => {
    if (globalFreq && frecuencias.includes(globalFreq)) {
      setFrecuencia(globalFreq)
    }
  }, [globalFreq])

  const loadFuentes = async (r) => {
    setRepo(r); setFuente(''); setFrecuencias([]); setFrecuencia(''); setSeries([]); setSerie(null)
    setLoading(true); setError('')
    try {
      const data = await getFuentes(r)
      setFuentes(data.filter(f => f.available !== false))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const loadFrecuencias = async (f) => {
    setFuente(f); setFrecuencias([]); setFrecuencia(''); setSeries([]); setSerie(null)
    setLoading(true); setError('')
    try {
      const data = await getFrecuencias(repo, f)
      setFrecuencias(data)
      // Auto-select if matches global freq
      const match = globalFreq && data.includes(globalFreq) ? globalFreq : data[0]
      if (match) loadSeries(f, match)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const loadSeries = async (fuenteVal, freqVal) => {
    setFrecuencia(freqVal); setSeries([]); setSerie(null)
    setLoading(true); setError('')
    try {
      const data = await getSeries(repo, fuenteVal || fuente, freqVal)
      setSeries(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const selectSerie = (s) => {
    setSerie(s)
    if (!label) setLabel(s.serie_nombre.slice(0, 40))
  }

  const handleAdd = () => {
    if (!serie || !label.trim()) return
    onSelect({
      repo,
      fuente,
      frecuencia,
      serie: serie.serie_nombre_original || serie.serie_nombre,
      serie_nombre: serie.serie_nombre,
      label: label.trim(),
      meta_idx: serie.meta_idx,
      unidad: serie.unidad || '',
    })
  }

  const fuenteKey = (f) => f.fuente || f.cuadro
  const fuenteLabel = (f) => f.nombre || f.fuente_nombre || f.cuadro_nombre || f.cuadro

  return (
    <div className="rounded-xl p-4 space-y-3 animate-fade-in"
         style={{ background: '#111118', border: '1px solid #24243a' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-mono font-bold"
              style={{ background: '#24243a', color: '#e8a820' }}>{index + 1}</span>
        <span className="text-xs font-medium" style={{ color: '#88889a' }}>Serie</span>
      </div>

      {/* Repo selector */}
      <select
        value={repo}
        onChange={e => loadFuentes(e.target.value)}
        className={selectClass}
        style={selectStyle}
      >
        <option value="">— Fuente de datos —</option>
        {REPO_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>

      {/* Fuente/Cuadro */}
      {repo && (
        <select
          value={fuente}
          onChange={e => loadFrecuencias(e.target.value)}
          className={selectClass}
          style={selectStyle}
          disabled={loading}
        >
          <option value="">— Cuadro / Fuente —</option>
          {fuentes.map(f => (
            <option key={fuenteKey(f)} value={fuenteKey(f)}>{fuenteLabel(f)}</option>
          ))}
        </select>
      )}

      {/* Frecuencia */}
      {fuente && frecuencias.length > 0 && (
        <select
          value={frecuencia}
          onChange={e => loadSeries(fuente, e.target.value)}
          className={selectClass}
          style={selectStyle}
          disabled={loading}
        >
          {frecuencias.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      )}

      {/* Serie */}
      {series.length > 0 && (
        <select
          value={serie?.serie_id || ''}
          onChange={e => {
            const s = series.find(x => x.serie_id === e.target.value)
            if (s) selectSerie(s)
          }}
          className={selectClass}
          style={selectStyle}
        >
          <option value="">— Seleccionar serie —</option>
          {series.map(s => (
            <option key={s.serie_id} value={s.serie_id}>{s.serie_nombre}</option>
          ))}
        </select>
      )}

      {/* Label input + Add button */}
      {serie && (
        <div className="flex gap-2">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Nombre en el dataset…"
            className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
            style={{ background: '#1a1a24', border: '1px solid #32324e', color: '#e8e8f0' }}
          />
          <button
            onClick={handleAdd}
            disabled={!label.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: '#e8a820', color: '#0a0a0f' }}
          >
            Agregar
          </button>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: '#ff7c7c' }}>{error}</p>}
      {loading && <p className="text-xs animate-pulse" style={{ color: '#55556a' }}>Cargando…</p>}
    </div>
  )
}
