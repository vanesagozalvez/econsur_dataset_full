import { useState } from 'react'
import { buildDataset } from '../utils/api'
import SerieSelector from './SerieSelector'

const MAX_SERIES = 20
const REPO_C = { macro:'var(--gold)', comercio:'var(--teal)', empleo:'var(--violet)', precios:'var(--coral)' }
const REPO_L = { macro:'Macro', comercio:'Comercio', empleo:'Empleo', precios:'Precios' }

// Calcula la intersección de todos los períodos de las series seleccionadas
function calcInterseccion(series) {
  const conPeriodo = series.filter(s => s.periodos?.desde && s.periodos?.hasta)
  if (conPeriodo.length === 0) return null

  let desdeMax = conPeriodo[0].periodos.desde
  let hastaMin = conPeriodo[0].periodos.hasta

  for (const s of conPeriodo) {
    if (s.periodos.desde > desdeMax) desdeMax = s.periodos.desde
    if (s.periodos.hasta < hastaMin) hastaMin = s.periodos.hasta
  }

  return desdeMax <= hastaMin
    ? { desde: desdeMax, hasta: hastaMin, ok: true }
    : { desde: desdeMax, hasta: hastaMin, ok: false }
}

// Detecta series sin solapamiento con las demás
function seriesSinSolapamiento(series) {
  const inter = calcInterseccion(series)
  if (!inter || inter.ok) return []
  return series
    .filter(s => s.periodos?.desde && s.periodos?.hasta)
    .filter(s => s.periodos.desde > inter.hasta || s.periodos.hasta < inter.desde)
    .map(s => s.label)
}

export default function BuilderPanel({ onSave, savedCount, max }) {
  const [nombre,   setNombre]   = useState('')
  const [desde,    setDesde]    = useState('2010-01-01')
  const [hasta,    setHasta]    = useState(new Date().toISOString().slice(0, 10))
  const [freq,     setFreq]     = useState('Mensual')
  const [series,   setSeries]   = useState([])
  const [nSel,     setNSel]     = useState(1)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [warning,  setWarning]  = useState('')

  // Calcular validaciones en tiempo real
  const interseccion    = calcInterseccion(series)
  const sinSolapamiento = seriesSinSolapamiento(series)
  const hayConflicto    = series.length > 1 && interseccion && !interseccion.ok

  const addSerie = (s) => {
    if (series.length >= MAX_SERIES) return
    if (series.find(x => x.label === s.label)) { setError(`Ya existe "${s.label}".`); return }
    const nuevas = [...series, s]
    setSeries(nuevas)
    setError('')

    // Auto-ajustar el período global a la intersección si existe
    const inter = calcInterseccion(nuevas)
    if (inter?.ok) {
      setDesde(inter.desde)
      setHasta(inter.hasta)
      setWarning('')
    } else if (inter && !inter.ok) {
      setWarning('⚠ Los períodos de las series no se solapan. El dataset puede quedar vacío.')
    }
  }

  const removeSerie = (label) => {
    const nuevas = series.filter(x => x.label !== label)
    setSeries(nuevas)
    setWarning('')
    setError('')
    // Recalcular con las series restantes
    const inter = calcInterseccion(nuevas)
    if (inter?.ok) { setDesde(inter.desde); setHasta(inter.hasta) }
  }

  const handleSave = async () => {
    if (!nombre.trim())    { setError('Ingresá un nombre.'); return }
    if (!series.length)    { setError('Agregá al menos una serie.'); return }
    if (savedCount >= max) { setError(`Límite de ${max} datasets.`); return }
    if (desde > hasta)     { setError('La fecha "Desde" debe ser anterior a "Hasta".'); return }

    setLoading(true); setError('')
    try {
      const payload = {
        nombre: nombre.trim(), desde, hasta, frecuencia: freq,
        series: series.map(s => ({
          repo: s.repo, fuente: s.fuente, frecuencia: s.frecuencia,
          serie: s.serie, label: s.label, meta_idx: s.meta_idx ?? null,
        })),
      }
      const result = await buildDataset(payload)
      if (!result.data?.length) {
        setError('No se encontraron datos para el período seleccionado. Revisá que los períodos de las series coincidan.')
        return
      }
      const ok = onSave({ ...payload, result, buildPayload: payload })
      if (ok) { setNombre(''); setSeries([]); setNSel(1); setWarning('') }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* ── Columna izquierda: Selectores ── */}
      <div style={{
        flex:1, overflowY:'auto', padding:20,
        display:'flex', flexDirection:'column', gap:12,
        borderRight:'1px solid var(--ink-800)', maxWidth:540,
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h2 style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontSize:16, color:'#fff', margin:0 }}>
            Seleccionar Series
          </h2>
          <span style={{ fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:'#44446a' }}>
            {series.length}/{MAX_SERIES}
          </span>
        </div>

        {Array.from({ length: nSel }).map((_, i) => (
          <SerieSelector key={i} index={i} onSelect={addSerie} globalFreq={freq} />
        ))}

        {nSel < 12 && (
          <button
            onClick={() => setNSel(c => c + 1)}
            style={{
              background:'var(--ink-900)', border:'1px dashed var(--ink-600)',
              borderRadius:10, padding:'9px 0', fontSize:13, color:'#44446a',
              cursor:'pointer', transition:'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--gold)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--ink-600)'}
          >
            <span style={{ color:'var(--gold)' }}>+</span> Añadir selector
          </button>
        )}
      </div>

      {/* ── Columna derecha: Configuración ── */}
      <div style={{
        width:300, flexShrink:0, overflowY:'auto', padding:20,
        background:'var(--ink-900)',
        display:'flex', flexDirection:'column', gap:18,
      }}>
        <h2 style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontSize:16, color:'#fff', margin:0 }}>
          Configurar Dataset
        </h2>

        {/* Nombre */}
        <Field label="NOMBRE">
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Actividad 2010-2024"
            onKeyDown={e => e.key==='Enter' && handleSave()}
            style={INPUT} />
        </Field>

        {/* Frecuencia */}
        <Field label="FRECUENCIA">
          <div style={{ display:'flex', gap:6 }}>
            {['Mensual','Trimestral','Anual'].map(f => (
              <button key={f} onClick={() => setFreq(f)} style={{
                flex:1, padding:'6px 0', borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer',
                background: freq===f ? 'var(--gold)' : 'var(--ink-800)',
                color: freq===f ? '#000' : '#88889a',
                border: freq===f ? 'none' : '1px solid var(--ink-700)',
                transition:'all 0.12s',
              }}>{f}</button>
            ))}
          </div>
        </Field>

        {/* Período */}
        <Field label="PERÍODO">
          {/* Indicador de intersección cuando hay varias series */}
          {series.length >= 2 && interseccion && (
            <div style={{
              padding:'8px 12px', borderRadius:8, fontSize:11, marginBottom:8,
              background: interseccion.ok ? '#0a1f14' : '#1f0808',
              border: `1px solid ${interseccion.ok ? 'var(--teal)' : 'var(--coral)'}28`,
              color: interseccion.ok ? 'var(--teal)' : 'var(--coral)',
              display:'flex', flexDirection:'column', gap:4,
            }}>
              {interseccion.ok ? (
                <>
                  <span style={{ fontWeight:600 }}>✓ Períodos compatibles</span>
                  <span style={{ opacity:.8, fontFamily:'"JetBrains Mono",monospace', fontSize:10 }}>
                    Intersección: {interseccion.desde} → {interseccion.hasta}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontWeight:600 }}>✗ Sin solapamiento de períodos</span>
                  {sinSolapamiento.length > 0 && (
                    <span style={{ opacity:.8, fontSize:10 }}>
                      Conflicto en: {sinSolapamiento.join(', ')}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'#44446a', marginBottom:4 }}>Desde</div>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={INPUT} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'#44446a', marginBottom:4 }}>Hasta</div>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={INPUT} />
            </div>
          </div>
        </Field>

        {/* Series seleccionadas */}
        {series.length > 0 && (
          <Field label={`SERIES SELECCIONADAS (${series.length})`}>
            <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:200, overflowY:'auto' }}>
              {series.map(s => {
                // Marcar si esta serie tiene conflicto
                const tieneConflicto = sinSolapamiento.includes(s.label)
                return (
                  <div key={s.label} style={{
                    display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px',
                    borderRadius:8, background:'var(--ink-800)',
                    border: tieneConflicto
                      ? '1px solid var(--coral)28'
                      : '1px solid var(--ink-700)',
                  }}>
                    <span style={{
                      width:8, height:8, borderRadius:'50%', flexShrink:0, marginTop:4,
                      background: REPO_C[s.repo] || '#88889a',
                    }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:500, color:'#fff',
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize:11, color:'#44446a', marginTop:1 }}>
                        {REPO_L[s.repo]} · {s.frecuencia}
                      </div>
                      {/* Período disponible de esta serie */}
                      {s.periodos?.desde && (
                        <div style={{
                          fontSize:10, marginTop:3,
                          fontFamily:'"JetBrains Mono",monospace',
                          color: tieneConflicto ? 'var(--coral)' : '#55556a',
                        }}>
                          {tieneConflicto && '⚠ '}
                          {s.periodos.desde} → {s.periodos.hasta}
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeSerie(s.label)} style={{
                      flexShrink:0, background:'none', border:'none',
                      color:'#44446a', cursor:'pointer', fontSize:16, lineHeight:1, padding:2,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color='var(--coral)'}
                    onMouseLeave={e => e.currentTarget.style.color='#44446a'}
                    >×</button>
                  </div>
                )
              })}
            </div>
          </Field>
        )}

        {/* Advertencia de períodos */}
        {warning && !error && (
          <div style={{
            padding:'8px 12px', borderRadius:8, fontSize:12,
            background:'#1f1408', border:'1px solid var(--gold)40',
            color:'var(--gold)',
          }}>{warning}</div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding:'8px 12px', borderRadius:8, fontSize:12,
            background:'#1f0808', border:'1px solid var(--coral)40',
            color:'var(--coral)',
          }}>{error}</div>
        )}

        {/* Botón guardar */}
        <button
          onClick={handleSave}
          disabled={loading || !nombre.trim() || !series.length}
          style={{
            padding:'10px 0', borderRadius:10, fontWeight:600, fontSize:13,
            background:'linear-gradient(135deg,#e8a820,#c88c10)', color:'#000',
            border:'none', cursor: (loading || !nombre.trim() || !series.length) ? 'not-allowed' : 'pointer',
            opacity: (loading || !nombre.trim() || !series.length) ? .45 : 1,
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            transition:'opacity 0.12s',
          }}
        >
          {loading ? <><Spinner /> Construyendo…</> : <><CheckIcon /> Guardar Dataset</>}
        </button>

        <div style={{ textAlign:'center', fontSize:11,
                      fontFamily:'"JetBrains Mono",monospace', color:'#2a2a3e' }}>
          {savedCount}/{max} datasets guardados
        </div>
      </div>
    </div>
  )
}

const INPUT = {
  background:'var(--ink-800)', border:'1px solid var(--ink-700)',
  color:'#e8e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, width:'100%',
}

const Field = ({ label, children }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
    <div style={{ fontSize:11, fontWeight:500, color:'#55556a', letterSpacing:'.04em' }}>{label}</div>
    {children}
  </div>
)

const Spinner = () => (
  <svg style={{ width:15, height:15 }} className="animate-spin" fill="none" viewBox="0 0 24 24">
    <circle style={{ opacity:.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path style={{ opacity:.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
)
const CheckIcon = () => (
  <svg style={{ width:15, height:15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
  </svg>
)
