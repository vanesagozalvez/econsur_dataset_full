import { useState, useEffect } from 'react'
import { getFuentes, getFrecuencias, getSeries, getPeriodos } from '../utils/api'

const REPOS = [
  { value:'macro',    label:'Macroeconomía INDEC' },
  { value:'comercio', label:'Comercio Exterior ICA' },
  { value:'empleo',   label:'Empleo e Ingresos' },
  { value:'precios',  label:'Precios IPC' },
]

const S = {
  background:'var(--surface-raised)', border:'1px solid var(--border-subtle)',
  color:'var(--text-secondary)', borderRadius:8, padding:'6px 10px', fontSize:13, width:'100%',
}

export default function SerieSelector({ index, onSelect, globalFreq }) {
  const [repo,        setRepo]        = useState('')
  const [fuentes,     setFuentes]     = useState([])
  const [fuente,      setFuente]      = useState('')
  const [frecuencias, setFrecuencias] = useState([])
  const [frecuencia,  setFrecuencia]  = useState('')
  const [series,      setSeries]      = useState([])
  const [serie,       setSerie]       = useState(null)
  const [label,       setLabel]       = useState('')
  const [periodos,    setPeriodos]    = useState(null)   // { desde, hasta } de la serie elegida
  const [loadingP,    setLoadingP]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (globalFreq && frecuencias.includes(globalFreq) && frecuencia !== globalFreq) {
      loadSeries(fuente, globalFreq)
    }
  }, [globalFreq])

  const reset = (level) => {
    if (level <= 1) { setFuente(''); setFuentes([]) }
    if (level <= 2) { setFrecuencias([]); setFrecuencia('') }
    if (level <= 3) { setSeries([]); setSerie(null); setPeriodos(null) }
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
    setFrecuencia(frVal); setSeries([]); setSerie(null); setPeriodos(null)
    setLoading(true)
    try {
      const data = await getSeries(repo, fVal || fuente, frVal)
      setSeries(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // Al elegir serie → consultar períodos disponibles automáticamente
  const onSerie = async (s) => {
    setSerie(s); setPeriodos(null)
    if (!label) setLabel(s.serie_nombre.slice(0, 42))
    setLoadingP(true)
    try {
      const p = await getPeriodos(repo, fuente, frecuencia,
        s.serie_nombre_original || s.serie_nombre, s.meta_idx ?? undefined)
      setPeriodos(p)
    } catch (e) {
      setPeriodos(null)
    } finally {
      setLoadingP(false)
    }
  }

  const handleAdd = () => {
    if (!serie || !label.trim()) return
    onSelect({
      repo, fuente, frecuencia,
      serie:        serie.serie_nombre_original || serie.serie_nombre,
      serie_nombre: serie.serie_nombre,
      label:        label.trim(),
      meta_idx:     serie.meta_idx ?? null,
      unidad:       serie.unidad || '',
      periodos,     // { desde, hasta } — se usa para validar coincidencia
    })
    setSerie(null); setLabel(''); setPeriodos(null)
  }

  const fKey   = f => f.fuente || f.cuadro || ''
  const fLabel = f => f.nombre || f.fuente_nombre || f.cuadro_nombre || f.cuadro || ''

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border-subtle)',
                  borderRadius:12, padding:14, display:'flex', flexDirection:'column', gap:8 }}
         className="fade-up">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{
          width:20, height:20, borderRadius:'50%', fontSize:11, fontWeight:'bold',
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'var(--ink-700)', color:'var(--gold)',
          fontFamily:'"JetBrains Mono",monospace', flexShrink:0,
        }}>{index + 1}</span>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Serie</span>
        {loading && <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }} className="pulse-dot">cargando…</span>}
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

      {/* Rango de períodos disponibles de la serie */}
      {serie && (
        <div style={{
          padding:'8px 12px', borderRadius:8, fontSize:12,
          background:'var(--surface-raised)', border:'1px solid var(--border-subtle)',
          display:'flex', alignItems:'center', gap:8,
        }}>
          <CalIcon />
          {loadingP ? (
            <span style={{ color:'var(--text-muted)' }} className="pulse-dot">Consultando períodos…</span>
          ) : periodos?.desde ? (
            <>
              <span style={{ color:'var(--text-secondary)' }}>Disponible:</span>
              <span style={{ color:'var(--teal)', fontFamily:'"JetBrains Mono",monospace', fontWeight:500 }}>
                {periodos.desde}
              </span>
              <span style={{ color:'var(--text-muted)' }}>→</span>
              <span style={{ color:'var(--teal)', fontFamily:'"JetBrains Mono",monospace', fontWeight:500 }}>
                {periodos.hasta}
              </span>
            </>
          ) : (
            <span style={{ color:'var(--text-muted)' }}>Sin datos de período</span>
          )}
        </div>
      )}

      {/* Label + Agregar */}
      {serie && (
        <div style={{ display:'flex', gap:8 }}>
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
            style={{
              background:'var(--gold)', color:'#000', borderRadius:8,
              padding:'6px 14px', fontSize:13, fontWeight:600, cursor:'pointer',
              border:'none', whiteSpace:'nowrap', opacity: !label.trim() ? .4 : 1,
            }}
          >+ Agregar</button>
        </div>
      )}

      {error && <p style={{ fontSize:11, color:'var(--coral)', margin:0 }}>{error}</p>}
    </div>
  )
}

const CalIcon = () => (
  <svg style={{ width:13, height:13, flexShrink:0, color:'var(--teal)' }}
       fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
  </svg>
)
