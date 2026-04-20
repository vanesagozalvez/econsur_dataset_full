import { useState } from 'react'
import { buildDataset } from '../utils/api'
import SerieSelector from './SerieSelector'

const MAX_SERIES = 20
const REPO_C = { macro:'var(--gold)', comercio:'var(--teal)', empleo:'var(--violet)', precios:'var(--coral)' }
const REPO_L = { macro:'Macro', comercio:'Comercio', empleo:'Empleo', precios:'Precios' }

export default function BuilderPanel({ onSave, savedCount, max }) {
  const [nombre,   setNombre]   = useState('')
  const [desde,    setDesde]    = useState('2010-01-01')
  const [hasta,    setHasta]    = useState(new Date().toISOString().slice(0,10))
  const [freq,     setFreq]     = useState('Mensual')
  const [series,   setSeries]   = useState([])
  const [nSel,     setNSel]     = useState(1)   // número de selectores visibles
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const addSerie = (s) => {
    if (series.length >= MAX_SERIES) return
    if (series.find(x => x.label === s.label)) { setError(`Ya existe "${s.label}".`); return }
    setSeries(p => [...p, s]); setError('')
  }

  const removeSerie = (label) => setSeries(p => p.filter(x => x.label !== label))

  const handleSave = async () => {
    if (!nombre.trim())       { setError('Ingresá un nombre.'); return }
    if (!series.length)       { setError('Agregá al menos una serie.'); return }
    if (savedCount >= max)    { setError(`Límite de ${max} datasets.`); return }
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
      if (!result.data?.length) { setError('No se encontraron datos para el período seleccionado.'); return }
      const ok = onSave({ ...payload, result, buildPayload: payload })
      if (ok) { setNombre(''); setSeries([]); setNSel(1) }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Columna izquierda: Selectores ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3"
           style={{ maxWidth:530, borderRight:'1px solid var(--ink-800)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base text-white">Seleccionar Series</h2>
          <span className="text-xs font-mono" style={{ color:'#44446a' }}>{series.length}/{MAX_SERIES}</span>
        </div>

        {Array.from({ length: nSel }).map((_, i) => (
          <SerieSelector key={i} index={i} onSelect={addSerie} globalFreq={freq} />
        ))}

        {nSel < 12 && (
          <button
            onClick={() => setNSel(c => c + 1)}
            className="w-full py-2 rounded-xl text-sm transition-all"
            style={{ background:'var(--ink-900)', border:'1px dashed var(--ink-600)', color:'#44446a' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ink-600)'}
          >
            <span style={{ color:'var(--gold)' }}>+</span> Añadir selector
          </button>
        )}
      </div>

      {/* ── Columna derecha: Configuración ── */}
      <div className="w-72 flex-shrink-0 overflow-y-auto p-5 space-y-5"
           style={{ background:'var(--ink-900)' }}>

        <h2 className="font-display text-base text-white">Configurar Dataset</h2>

        {/* Nombre */}
        <Field label="NOMBRE">
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Actividad 2010-2024" onKeyDown={e => e.key==='Enter' && handleSave()}
            style={INPUT} />
        </Field>

        {/* Frecuencia */}
        <Field label="FRECUENCIA">
          <div className="flex gap-1.5">
            {['Mensual','Trimestral','Anual'].map(f => (
              <button key={f} onClick={() => setFreq(f)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={freq === f
                  ? { background:'var(--gold)', color:'#000' }
                  : { background:'var(--ink-800)', border:'1px solid var(--ink-700)', color:'#88889a' }}>
                {f}
              </button>
            ))}
          </div>
        </Field>

        {/* Período */}
        <Field label="PERÍODO">
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color:'#44446a' }}>Desde</p>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={INPUT} />
            </div>
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color:'#44446a' }}>Hasta</p>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={INPUT} />
            </div>
          </div>
        </Field>

        {/* Series seleccionadas */}
        {series.length > 0 && (
          <Field label={`SERIES SELECCIONADAS (${series.length})`}>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {series.map(s => (
                <div key={s.label} className="flex items-start gap-2 rounded-lg px-3 py-2"
                     style={{ background:'var(--ink-800)', border:'1px solid var(--ink-700)' }}>
                  <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                        style={{ background: REPO_C[s.repo] || '#88889a' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{s.label}</p>
                    <p className="text-xs truncate" style={{ color:'#44446a' }}>
                      {REPO_L[s.repo]} · {s.frecuencia}
                    </p>
                  </div>
                  <button onClick={() => removeSerie(s.label)}
                    className="text-sm flex-shrink-0 transition-colors"
                    style={{ color:'#44446a' }}
                    onMouseEnter={e => e.currentTarget.style.color='var(--coral)'}
                    onMouseLeave={e => e.currentTarget.style.color='#44446a'}>×</button>
                </div>
              ))}
            </div>
          </Field>
        )}

        {error && (
          <p className="text-xs rounded-lg px-3 py-2"
             style={{ background:'#1f0808', border:'1px solid var(--coral)', color:'var(--coral)' }}>
            {error}
          </p>
        )}

        {/* Botón guardar */}
        <button
          onClick={handleSave}
          disabled={loading || !nombre.trim() || !series.length}
          className="w-full py-2.5 rounded-xl font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
          style={{ background:'linear-gradient(135deg,#e8a820,#c88c10)', color:'#000' }}
        >
          {loading
            ? <><Spinner /> Construyendo…</>
            : <><CheckIcon /> Guardar Dataset</>}
        </button>

        <p className="text-xs text-center" style={{ color:'#2a2a3e' }}>
          {savedCount}/{max} datasets guardados
        </p>
      </div>
    </div>
  )
}

const INPUT = { background:'var(--ink-800)', border:'1px solid var(--ink-700)',
                color:'#e8e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, width:'100%' }

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <p className="text-xs font-medium tracking-wide" style={{ color:'#55556a' }}>{label}</p>
    {children}
  </div>
)

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
)
const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
  </svg>
)
