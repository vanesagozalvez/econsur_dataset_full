import { useState } from 'react'
import ChartPanel from './ChartPanel'
import { exportDatasetCsv } from '../utils/api'
import { ChartViewIcon, TableViewIcon, InfoViewIcon } from './Icons'

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
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}
         className="fade-up">

      {/* ── Sub-header ── */}
      <div style={{
        flexShrink:0, padding:'10px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
        background:"var(--ink-900)", borderBottom:'1px solid var(--border)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, minWidth:0 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontSize:18, color:'var(--text-primary)', lineHeight:1.2 }}>
              {dataset.nombre}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
              {dataset.desde} → {dataset.hasta} · {dataset.frecuencia} · {data.length} períodos · {cols.length} series
            </div>
          </div>
          {/* Badges */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {cols.map(c => (
              <span key={c.label} style={{
                fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:500,
                background:(RC[c.repo]||'#88889a')+'18',
                color: RC[c.repo]||'#88889a',
                border:`1px solid ${(RC[c.repo]||'#88889a')}28`,
              }}>{c.label}</span>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          {err && <span style={{ fontSize:11, color:'var(--coral)' }}>{err}</span>}
          <ExportBtn onClick={doExport} disabled={busy || !data.length} label={busy ? 'Exportando…' : 'CSV'} />
        </div>
      </div>

      {/* ── View selector ── */}
      <div style={{
        flexShrink:0, padding:'8px 20px', height:50, display:'flex', alignItems:'center', gap:6,
        borderBottom:'1px solid var(--border)',
        background:'var(--ink-850)',
      }}>
        {[
          ['chart', 'Gráfico', ChartViewIcon],
          ['table', 'Tabla', TableViewIcon],
          ['info', 'Metadata', InfoViewIcon]
        ].map(([id, title, Icon]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            title={title}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center',
              width:42, height:36, borderRadius:8, cursor:'pointer',
              background: view===id ? 'var(--ink-800)' : 'transparent',
              color: view===id ? 'var(--gold)' : '#88889a',
              border: view===id ? '1px solid var(--gold)' : '1px solid transparent',
              transition:'all 0.12s',
            }}
            onMouseEnter={e => {
              if (view !== id) {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
              }
            }}
            onMouseLeave={e => {
              if (view !== id) {
                e.currentTarget.style.color = '#88889a'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <Icon size={18} />
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex:1, overflow:'hidden', padding:20 }}>
        {view === 'chart' && <ChartPanel dataset={dataset} />}
        {view === 'table' && <TableView data={data} cols={cols} />}
        {view === 'info'  && <MetaView  dataset={dataset} cols={cols} />}
      </div>
    </div>
  )
}

/* ── Tabla ── */
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
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:10 }}>
      <div style={{ flex:1, overflow:'auto', borderRadius:10, border:'1px solid var(--border)' }}>
        <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:"var(--ink-900)", position:'sticky', top:0 }}>
              <th style={{ textAlign:'left', padding:'10px 14px', color:'var(--text-muted)', fontWeight:500, borderBottom:'1px solid var(--border)' }}>Período</th>
              {cols.map(c => (
                <th key={c.label} style={{ textAlign:'right', padding:'10px 14px', color:'var(--text-muted)', fontWeight:500, whiteSpace:'nowrap', borderBottom:'1px solid var(--border)' }}>
                  {c.label}{c.unidad && <span style={{ opacity:.4, marginLeft:4 }}>({c.unidad})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.periodo||i} style={{ borderBottom:'1px solid var(--ink-900)' }}
                  onMouseEnter={e => e.currentTarget.style.background="var(--ink-900)"}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td style={{ padding:'8px 14px', fontFamily:'"JetBrains Mono",monospace', color:'var(--gold)', borderRight:'1px solid var(--ink-800)' }}>{row.periodo}</td>
                {cols.map(c => (
                  <td key={c.label} style={{ padding:'8px 14px', textAlign:'right', fontFamily:'"JetBrains Mono",monospace', color:'var(--text-secondary)' }}>
                    {fmt(row[c.label])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 1 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>{page*PS+1}–{Math.min((page+1)*PS, data.length)} de {data.length}</span>
          <div style={{ display:'flex', gap:4 }}>
            {[['«',0],['‹',page-1]].map(([l,t]) => (
              <PagBtn key={l} onClick={() => setPage(Math.max(0,t))} disabled={page===0} label={l} />
            ))}
            <span style={{ padding:'4px 10px', fontSize:11, color:'var(--text-muted)' }}>{page+1}/{total}</span>
            {[['›',page+1],['»',total-1]].map(([l,t]) => (
              <PagBtn key={l} onClick={() => setPage(Math.min(total-1,t))} disabled={page>=total-1} label={l} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Metadata ── */
function MetaView({ dataset, cols }) {
  return (
    <div style={{ overflowY:'auto', height:'100%', display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ padding:16, borderRadius:10, background:"var(--ink-900)", border:'1px solid var(--border)' }}>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:12 }}>Parámetros del Dataset</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[['Nombre',dataset.nombre],['Frecuencia',dataset.frecuencia],
            ['Período',`${dataset.desde} → ${dataset.hasta}`],
            ['Series',`${cols.length}`],
            ['Observaciones',`${dataset.result?.data?.length||0} períodos`]
          ].map(([k,v]) => (
            <div key={k}>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>{k}</div>
              <div style={{ fontSize:13, color:'var(--text-secondary)', marginTop:2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:10 }}>Series</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {cols.map((c, i) => {
            const color = RC[c.repo]||'#88889a'
            const ref   = dataset.series?.[i]
            return (
              <div key={c.label} style={{ padding:12, borderRadius:10, background:"var(--ink-900)", border:`1px solid ${color}28` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: ref ? 8 : 0 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }} />
                  <span style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', flex:1 }}>{c.label}</span>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:color+'18', color }}>{RL[c.repo]||c.repo}</span>
                </div>
                {ref && (
                  <div style={{ fontSize:11, color:'var(--text-muted)', paddingLeft:16, display:'flex', flexDirection:'column', gap:2 }}>
                    <span>Fuente: {ref.fuente}</span>
                    <span>Serie: {ref.serie}</span>
                    {c.unidad && <span>Unidad: {c.unidad}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ── */
const ExportBtn = ({ onClick, disabled, label }) => (
  <button onClick={onClick} disabled={disabled} style={{
    display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
    borderRadius:8, fontSize:12, fontWeight:500, cursor: disabled ? 'not-allowed' : 'pointer',
    background:"var(--ink-800)", border:'1px solid var(--border-subtle)', color:'var(--text-secondary)',
    opacity: disabled ? .4 : 1, transition:'border-color 0.12s',
  }}
  onMouseEnter={e => { if(!disabled) e.currentTarget.style.borderColor='var(--gold)' }}
  onMouseLeave={e => e.currentTarget.style.borderColor='var(--ink-700)'}>
  <DownIcon /> {label}
  </button>
)

const PagBtn = ({ onClick, disabled, label }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding:'4px 8px', borderRadius:6, fontSize:12, cursor: disabled?'not-allowed':'pointer',
    background:"var(--ink-800)", color:'var(--text-secondary)', border:'none', opacity: disabled?.3:1,
  }}>{label}</button>
)

const DownIcon  = () => <svg style={{width:13,height:13}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
