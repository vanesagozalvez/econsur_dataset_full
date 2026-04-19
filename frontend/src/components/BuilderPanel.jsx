import { useState } from 'react'
import { buildDataset, exportDatasetCsv } from '../utils/api'
import SerieSelector from './SerieSelector'

const MAX_SERIES = 20

export default function BuilderPanel({ onSave, savedCount, maxDatasets }) {
  const [nombre, setNombre] = useState('')
  const [desde, setDesde] = useState('2010-01-01')
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10))
  const [frecuencia, setFrecuencia] = useState('Mensual')
  const [selectedSeries, setSelectedSeries] = useState([])
  const [selectorCount, setSelectorCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addSerie = (serie) => {
    if (selectedSeries.length >= MAX_SERIES) return
    // Check duplicate labels
    if (selectedSeries.find(s => s.label === serie.label)) {
      setError(`Ya existe una serie con el nombre "${serie.label}".`)
      return
    }
    setSelectedSeries(prev => [...prev, serie])
    setError('')
  }

  const removeSerie = (label) => {
    setSelectedSeries(prev => prev.filter(s => s.label !== label))
  }

  const handleSave = async () => {
    if (!nombre.trim()) { setError('Ingresá un nombre para el dataset.'); return }
    if (selectedSeries.length === 0) { setError('Agregá al menos una serie.'); return }
    if (savedCount >= maxDatasets) { setError(`Límite de ${maxDatasets} datasets alcanzado.`); return }

    setLoading(true); setError('')
    try {
      const payload = {
        nombre: nombre.trim(),
        series: selectedSeries.map(s => ({
          repo: s.repo,
          fuente: s.fuente,
          frecuencia: s.frecuencia,
          serie: s.serie,
          label: s.label,
          meta_idx: s.meta_idx ?? null,
        })),
        desde,
        hasta,
        frecuencia,
      }
      const result = await buildDataset(payload)
      const saved = { ...payload, result, buildPayload: payload }
      const ok = onSave(saved)
      if (ok) {
        setNombre('')
        setSelectedSeries([])
        setSelectorCount(1)
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const REPO_COLORS = {
    macro: '#e8a820', comercio: '#38d9c0', empleo: '#a78bfa', precios: '#ff7c7c'
  }
  const REPO_LABELS = {
    macro: 'Macro', comercio: 'Comercio', empleo: 'Empleo', precios: 'Precios'
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Series selectors ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ maxWidth: '520px', borderRight: '1px solid #1a1a24' }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg text-white">Seleccionar Series</h2>
          <span className="text-xs font-mono" style={{ color: '#55556a' }}>
            {selectedSeries.length}/{MAX_SERIES}
          </span>
        </div>

        {/* Selectors */}
        {Array.from({ length: selectorCount }).map((_, i) => (
          <SerieSelector
            key={i}
            index={i}
            onSelect={addSerie}
            globalFreq={frecuencia}
            globalDesde={desde}
            globalHasta={hasta}
          />
        ))}

        {selectorCount < 10 && (
          <button
            onClick={() => setSelectorCount(c => c + 1)}
            className="w-full py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            style={{ background: '#111118', border: '1px dashed #32324e', color: '#55556a' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#e8a820'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#32324e'}
          >
            <span style={{ color: '#e8a820' }}>+</span> Añadir selector
          </button>
        )}
      </div>

      {/* ── Right: Dataset config ── */}
      <div className="w-80 flex-shrink-0 overflow-y-auto p-6 space-y-6" style={{ background: '#0e0e16' }}>
        <h2 className="font-display text-lg text-white">Configurar Dataset</h2>

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: '#88889a' }}>NOMBRE</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Actividad 2010-2024"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: '#1a1a24', border: '1px solid #32324e', color: '#e8e8f0' }}
          />
        </div>

        {/* Frecuencia global */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: '#88889a' }}>FRECUENCIA</label>
          <div className="flex gap-2">
            {['Mensual', 'Trimestral', 'Anual'].map(f => (
              <button
                key={f}
                onClick={() => setFrecuencia(f)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={frecuencia === f
                  ? { background: '#e8a820', color: '#0a0a0f' }
                  : { background: '#1a1a24', border: '1px solid #32324e', color: '#88889a' }}
              >{f}</button>
            ))}
          </div>
        </div>

        {/* Period */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: '#88889a' }}>PERÍODO</label>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <span className="text-xs" style={{ color: '#55556a' }}>Desde</span>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
                style={{ background: '#1a1a24', border: '1px solid #32324e', color: '#c8c8d8' }} />
            </div>
            <div className="flex-1 space-y-1">
              <span className="text-xs" style={{ color: '#55556a' }}>Hasta</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
                style={{ background: '#1a1a24', border: '1px solid #32324e', color: '#c8c8d8' }} />
            </div>
          </div>
        </div>

        {/* Selected series list */}
        {selectedSeries.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium" style={{ color: '#88889a' }}>
              SERIES SELECCIONADAS ({selectedSeries.length})
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {selectedSeries.map((s, i) => (
                <div key={s.label} className="flex items-start gap-2 rounded-lg px-3 py-2"
                     style={{ background: '#1a1a24', border: '1px solid #24243a' }}>
                  <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                        style={{ background: REPO_COLORS[s.repo] || '#88889a' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{s.label}</p>
                    <p className="text-xs truncate" style={{ color: '#55556a' }}>
                      {REPO_LABELS[s.repo]} · {s.frecuencia}
                    </p>
                  </div>
                  <button onClick={() => removeSerie(s.label)}
                          className="text-xs flex-shrink-0 transition-colors hover:text-red-400"
                          style={{ color: '#55556a' }}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs rounded-lg px-3 py-2"
             style={{ background: '#2a1010', border: '1px solid #ff5454', color: '#ff7c7c' }}>
            {error}
          </p>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={loading || !nombre.trim() || selectedSeries.length === 0}
          className="w-full py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #e8a820, #c88c10)', color: '#0a0a0f' }}
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Construyendo…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
              Guardar Dataset
            </>
          )}
        </button>

        <p className="text-xs text-center" style={{ color: '#32324e' }}>
          {savedCount}/{maxDatasets} datasets guardados
        </p>
      </div>
    </div>
  )
}
