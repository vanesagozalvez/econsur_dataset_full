import { useState } from 'react'
import ChartPanel from './ChartPanel'
import { exportDatasetCsv } from '../utils/api'

const REPO_COLORS = {
  macro: '#e8a820', comercio: '#38d9c0', empleo: '#a78bfa', precios: '#ff7c7c'
}
const REPO_LABELS = {
  macro: 'Macro INDEC', comercio: 'Comercio ICA', empleo: 'Empleo/Ingresos', precios: 'Precios IPC'
}

export default function DatasetTab({ dataset }) {
  const [view, setView] = useState('chart')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const result = dataset.result || {}
  const columnas = result.columnas || []
  const data = result.data || []
  const totalRows = data.length
  const totalCols = columnas.length

  const handleExportCsv = async () => {
    setExporting(true); setExportError('')
    try {
      await exportDatasetCsv(dataset.buildPayload)
    } catch (e) { setExportError(e.message) }
    finally { setExporting(false) }
  }

  const tabBtn = (id, label, icon) => (
    <button
      onClick={() => setView(id)}
      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all"
      style={view === id
        ? { background: '#1a1a24', color: '#e8e8f0', border: '1px solid #32324e' }
        : { color: '#55556a' }}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in">
      {/* ── Dataset header ── */}
      <div className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between"
           style={{ borderColor: '#1a1a24', background: '#0e0e16' }}>
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-display text-xl text-white leading-tight">{dataset.nombre}</h2>
            <p className="text-xs mt-0.5" style={{ color: '#55556a' }}>
              {dataset.desde} → {dataset.hasta} · {dataset.frecuencia} · {totalRows} períodos · {totalCols} series
            </p>
          </div>
          {/* Series badges */}
          <div className="flex flex-wrap gap-1.5">
            {columnas.map(c => (
              <span key={c.label} className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: (REPO_COLORS[c.repo] || '#88889a') + '20',
                      color: REPO_COLORS[c.repo] || '#88889a',
                      border: `1px solid ${(REPO_COLORS[c.repo] || '#88889a')}40`,
                    }}>
                {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {exportError && (
            <span className="text-xs" style={{ color: '#ff7c7c' }}>{exportError}</span>
          )}
          <button
            onClick={handleExportCsv}
            disabled={exporting || data.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: '#1a1a24', border: '1px solid #32324e', color: '#88889a' }}
            onMouseEnter={e => { if (!exporting) e.currentTarget.style.borderColor = '#e8a820' }}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#32324e'}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting ? 'Exportando…' : 'CSV'}
          </button>
        </div>
      </div>

      {/* ── View tabs ── */}
      <div className="flex-shrink-0 px-6 py-2 flex items-center gap-1 border-b"
           style={{ borderColor: '#1a1a24' }}>
        {tabBtn('chart', 'Gráfico',
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )}
        {tabBtn('table', 'Tabla',
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 10h18M3 14h18M10 3v18M14 3v18" />
          </svg>
        )}
        {tabBtn('info', 'Metadata',
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden p-6">
        {view === 'chart' && <ChartPanel dataset={dataset} />}
        {view === 'table' && <TableView data={data} columnas={columnas} />}
        {view === 'info' && <MetaView dataset={dataset} columnas={columnas} />}
      </div>
    </div>
  )
}

// ── Table view ────────────────────────────────────────────────────────────────
function TableView({ data, columnas }) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(data.length / PAGE_SIZE)

  const fmt = (v) => {
    if (v === null || v === undefined) return <span style={{ color: '#32324e' }}>—</span>
    const n = Number(v)
    if (isNaN(n)) return v
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex-1 overflow-auto rounded-xl" style={{ border: '1px solid #1a1a24' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: '#111118', borderBottom: '1px solid #1a1a24' }}>
              <th className="text-left px-4 py-3 font-medium sticky left-0"
                  style={{ color: '#88889a', background: '#111118' }}>
                Período
              </th>
              {columnas.map(c => (
                <th key={c.label} className="text-right px-4 py-3 font-medium whitespace-nowrap"
                    style={{ color: '#88889a' }}>
                  {c.label}
                  {c.unidad && <span className="ml-1 text-xs opacity-50">({c.unidad})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, i) => (
              <tr key={row.periodo || i}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid #111118' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#111118'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td className="px-4 py-2.5 font-mono sticky left-0"
                    style={{ color: '#e8a820', background: 'inherit', borderRight: '1px solid #1a1a24' }}>
                  {row.periodo}
                </td>
                {columnas.map(c => (
                  <td key={c.label} className="px-4 py-2.5 text-right font-mono"
                      style={{ color: '#c8c8d8' }}>
                    {fmt(row[c.label])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-xs" style={{ color: '#55556a' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.length)} de {data.length} filas
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(0)} disabled={page === 0}
              className="px-3 py-1 rounded text-xs disabled:opacity-30 transition-colors"
              style={{ background: '#1a1a24', color: '#88889a' }}>«</button>
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
              className="px-3 py-1 rounded text-xs disabled:opacity-30 transition-colors"
              style={{ background: '#1a1a24', color: '#88889a' }}>‹</button>
            <span className="px-3 py-1 text-xs" style={{ color: '#55556a' }}>
              {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded text-xs disabled:opacity-30 transition-colors"
              style={{ background: '#1a1a24', color: '#88889a' }}>›</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded text-xs disabled:opacity-30 transition-colors"
              style={{ background: '#1a1a24', color: '#88889a' }}>»</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Metadata view ─────────────────────────────────────────────────────────────
function MetaView({ dataset, columnas }) {
  const REPO_COLORS = {
    macro: '#e8a820', comercio: '#38d9c0', empleo: '#a78bfa', precios: '#ff7c7c'
  }
  const REPO_LABELS = {
    macro: 'Macroeconomía INDEC', comercio: 'Comercio Exterior ICA',
    empleo: 'Empleo e Ingresos', precios: 'Precios IPC'
  }

  return (
    <div className="space-y-6 overflow-y-auto h-full pr-2">
      {/* Dataset info */}
      <div className="rounded-xl p-5 space-y-3" style={{ background: '#111118', border: '1px solid #1a1a24' }}>
        <h3 className="text-sm font-semibold text-white">Parámetros del Dataset</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Nombre', dataset.nombre],
            ['Frecuencia', dataset.frecuencia],
            ['Período', `${dataset.desde} → ${dataset.hasta}`],
            ['Series', `${columnas.length} series`],
            ['Observaciones', `${dataset.result?.data?.length || 0} períodos`],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span className="text-xs" style={{ color: '#55556a' }}>{k}</span>
              <span style={{ color: '#c8c8d8' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Series detail */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Series Incluidas</h3>
        {columnas.map((c, i) => {
          const color = REPO_COLORS[c.repo] || '#88889a'
          const serieRef = dataset.series?.[i]
          return (
            <div key={c.label} className="rounded-xl p-4 space-y-2"
                 style={{ background: '#111118', border: `1px solid ${color}30` }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-sm font-medium text-white">{c.label}</span>
                <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
                      style={{ background: color + '20', color }}>
                  {REPO_LABELS[c.repo] || c.repo}
                </span>
              </div>
              {serieRef && (
                <div className="text-xs space-y-1 pl-4" style={{ color: '#55556a' }}>
                  <p><span style={{ color: '#44446a' }}>Fuente:</span> {serieRef.fuente}</p>
                  <p><span style={{ color: '#44446a' }}>Serie:</span> {serieRef.serie}</p>
                  <p><span style={{ color: '#44446a' }}>Frecuencia:</span> {serieRef.frecuencia}</p>
                  {c.unidad && <p><span style={{ color: '#44446a' }}>Unidad:</span> {c.unidad}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
