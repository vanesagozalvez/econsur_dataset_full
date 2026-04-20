import { useState } from 'react'
import ChartPanel from './ChartPanel'
import { exportDatasetCsv } from '../utils/api'

const RC = { macro:'var(--gold)', comercio:'var(--teal)', empleo:'var(--violet)', precios:'var(--coral)' }
const RL = { macro:'Macro INDEC', comercio:'Comercio ICA', empleo:'Empleo/Ingresos', precios:'Precios IPC' }

export default function DatasetTab({ dataset }) {
  const [view,  setView]  = useState('chart')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  const result  = dataset.result  || {}
  const cols    = result.columnas || []
  const data    = result.data     || []

  const doExport = async () => {
    setBusy(true); setErr('')
    try { await exportDatasetCsv(dataset.buildPayload) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden fade-up">

      {/* ── Sub-header ── */}
      <div className="flex-shrink-0 px-5 py-3 flex items-center justify-between gap-4"
           style={{ background:'var(--ink-900)', borderBottom:'1px solid var(--ink-800)' }}>
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg text-white leading-tight truncate">{dataset.nombre}</h2>
            <p className="text-xs" style={{ color:'#44446a' }}>
              {dataset.desde} → {dataset.hasta} · {dataset.frecuencia} · {data.length} períodos · {cols.length} series
            </p>
          </div>
          {/* Badges */}
          <div className="hidden md:flex flex-wrap gap-1.5">
            {cols.map(c => (
              <span key={c.label} className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background:(RC[c.repo]||'#88889a')+'18', color:RC[c.repo]||'#88889a',
                             border:`1px solid ${(RC[c.repo]||'#88889a')}30` }}>
                {c.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {err && <span className="text-xs" style={{ color:'var(--coral)' }}>{err}</span>}
          <button onClick={doExport} disabled={busy || !data.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 transition-all"
            style={{ background:'var(--ink-800)', border:'1px solid var(--ink-700)', color:'#88889a' }}
            onMouseEnter={e => { if(!busy) e.currentTarget.style.borderColor='var(--gold)' }}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--ink-700)'}>
            <DownloadIcon />
            {busy ? 'Exportando…' : 'CSV'}
          </button>
        </div>
      </div>

      {/* ── View selector ── */}
      <div className="flex-shrink-0 px-5 py-1.5 flex gap-1"
           style={{ borderBottom:'1px solid var(--ink-800)' }}>
        {[
          ['chart', 'Gráfico',  <ChartSvg />],
          ['table', 'Tabla',    <TableSvg />],
          ['info',  'Metadata', <InfoSvg  />],
        ].map(([id, lbl, ico]) => (
          <button key={id} onClick={() => setView(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
            style={view === id
              ? { background:'var(--ink-800)', color:'#e8e8f0', border:'1px solid var(--ink-700)' }
              : { color:'#44446a' }}>
            {ico} {lbl}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden p-5">
        {view === 'chart' && <ChartPanel dataset={dataset} />}
        {view === 'table' && <TableView data={data} cols={cols} />}
        {view === 'info'  && <MetaView  dataset={dataset} cols={cols} />}
      </div>
    </div>
  )
}

// ── Tabla ─────────────────────────────────────────────────────────────────────
function TableView({ data, cols }) {
  const [page, setPage] = useState(0)
  const PS = 50
  const total = Math.ceil(data.length / PS)
  const rows  = data.slice(page * PS, (page + 1) * PS)

  const fmt = v => {
    if (v == null) return <span style={{ color:'#2a2a3e' }}>—</span>
    const n = Number(v)
    return isNaN(n) ? v : n.toLocaleString('es-AR', { minimumFractionDigits:2, maximumFractionDigits:4 })
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex-1 overflow-auto rounded-xl" style={{ border:'1px solid var(--ink-800)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background:'var(--ink-900)', borderBottom:'1px solid var(--ink-800)', position:'sticky', top:0 }}>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color:'#55556a' }}>Período</th>
              {cols.map(c => (
                <th key={c.label} className="text-right px-4 py-2.5 font-medium whitespace-nowrap"
                    style={{ color:'#55556a' }}>
                  {c.label}{c.unidad && <span className="ml-1 opacity-40">({c.unidad})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.periodo||i} style={{ borderBottom:'1px solid var(--ink-900)' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--ink-900)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td className="px-4 py-2 font-mono" style={{ color:'var(--gold)' }}>{row.periodo}</td>
                {cols.map(c => (
                  <td key={c.label} className="px-4 py-2 text-right font-mono" style={{ color:'#c8c8d8' }}>
                    {fmt(row[c.label])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 1 && (
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-xs" style={{ color:'#44446a' }}>
            {page*PS+1}–{Math.min((page+1)*PS, data.length)} de {data.length}
          </span>
          <div className="flex gap-1">
            {[['«',0],['‹',page-1]].map(([l,t]) => (
              <button key={l} onClick={() => setPage(Math.max(0,t))} disabled={page===0}
                className="px-2 py-1 rounded text-xs disabled:opacity-30"
                style={{ background:'var(--ink-800)', color:'#88889a' }}>{l}</button>
            ))}
            <span className="px-2 py-1 text-xs" style={{ color:'#44446a' }}>{page+1}/{total}</span>
            {[['>',page+1],['»',total-1]].map(([l,t]) => (
              <button key={l} onClick={() => setPage(Math.min(total-1,t))} disabled={page>=total-1}
                className="px-2 py-1 rounded text-xs disabled:opacity-30"
                style={{ background:'var(--ink-800)', color:'#88889a' }}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Metadata ──────────────────────────────────────────────────────────────────
function MetaView({ dataset, cols }) {
  return (
    <div className="space-y-5 overflow-y-auto h-full pr-1">
      <div className="rounded-xl p-4" style={{ background:'var(--ink-900)', border:'1px solid var(--ink-800)' }}>
        <h3 className="text-sm font-semibold text-white mb-3">Parámetros</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[['Nombre',dataset.nombre],['Frecuencia',dataset.frecuencia],
            ['Período',`${dataset.desde} → ${dataset.hasta}`],
            ['Series',`${cols.length}`],
            ['Observaciones',`${dataset.result?.data?.length||0} períodos`]
          ].map(([k,v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span className="text-xs" style={{ color:'#44446a' }}>{k}</span>
              <span className="text-sm" style={{ color:'#c8c8d8' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Series</h3>
        {cols.map((c, i) => {
          const color = RC[c.repo]||'#88889a'
          const ref   = dataset.series?.[i]
          return (
            <div key={c.label} className="rounded-xl p-3 space-y-1.5"
                 style={{ background:'var(--ink-900)', border:`1px solid ${color}28` }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background:color }} />
                <span className="text-sm font-medium text-white flex-1">{c.label}</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background:color+'18', color }}>{RL[c.repo]||c.repo}</span>
              </div>
              {ref && (
                <div className="text-xs pl-4 space-y-0.5" style={{ color:'#44446a' }}>
                  <p>Fuente: <span style={{ color:'#55556a' }}>{ref.fuente}</span></p>
                  <p>Serie: <span style={{ color:'#55556a' }}>{ref.serie}</span></p>
                  {c.unidad && <p>Unidad: <span style={{ color:'#55556a' }}>{c.unidad}</span></p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Icons
const DownloadIcon = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
const ChartSvg   = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
const TableSvg   = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18"/></svg>
const InfoSvg    = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
