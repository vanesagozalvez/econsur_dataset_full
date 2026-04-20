import { useState, useEffect, useRef, useCallback } from 'react'

let Plotly = null
const loadPlotly = async () => {
  if (!Plotly) Plotly = (await import('plotly.js-dist-min')).default
  return Plotly
}

function sma(values, w) {
  return values.map((_, i) => {
    if (i < w - 1) return null
    const sl = values.slice(i - w + 1, i + 1).filter(v => v != null)
    return sl.length === w ? sl.reduce((a, b) => a + b, 0) / w : null
  })
}

const COLORS = ['#e8a820','#38d9c0','#a78bfa','#ff7c7c','#60d4f0','#f0a060','#80d48c','#f080c0']

const CtrlBtn = ({ active, onClick, color, children }) => (
  <button onClick={onClick} style={{
    padding:'4px 10px', borderRadius:7, fontSize:11, fontWeight:500, cursor:'pointer',
    background: active ? color+'22' : 'var(--ink-800)',
    color: active ? color : '#44446a',
    border: active ? `1px solid ${color}55` : '1px solid var(--ink-700)',
    transition:'all 0.1s',
  }}>{children}</button>
)

export default function ChartPanel({ dataset }) {
  const ref     = useRef(null)
  const plotted = useRef(false)
  const cols    = dataset?.result?.columnas || []
  const data    = dataset?.result?.data     || []

  const [s1,  setS1]  = useState(cols[0]?.label || '')
  const [s2,  setS2]  = useState('')
  const [ct1, setCt1] = useState('scatter')
  const [ct2, setCt2] = useState('scatter')
  const [ma1, setMa1] = useState(0)
  const [ma2, setMa2] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => { loadPlotly().then(() => setReady(true)) }, [])
  useEffect(() => { if (cols.length) { setS1(cols[0]?.label || ''); setS2('') } }, [dataset])

  const buildTraces = useCallback(() => {
    const traces = []
    const xs = data.map(d => d.periodo)
    const add = (lbl, ct, ma, ci, yaxis) => {
      if (!lbl) return
      const ys    = data.map(d => d[lbl])
      const color = COLORS[ci % COLORS.length]
      const isArea = ct === 'scatter-area'
      if (ct === 'bar') {
        traces.push({ x:xs, y:ys, name:lbl, yaxis, type:'bar',
          marker:{ color: color+'99', line:{ color, width:1 } } })
      } else {
        traces.push({ x:xs, y:ys, name:lbl, yaxis, type:'scatter', mode:'lines',
          line:{ color, width:2 },
          ...(isArea ? { fill:'tozeroy', fillcolor: color+'18' } : {}) })
      }
      if (ma > 0) {
        traces.push({ x:xs, y:sma(ys, ma), name:`${lbl} MM${ma}`, yaxis,
          type:'scatter', mode:'lines',
          line:{ color, width:1.5, dash:'dot' }, opacity:0.8 })
      }
    }
    add(s1, ct1, ma1, 0, 'y')
    add(s2, ct2, ma2, 1, s2 && s2!==s1 ? 'y2' : 'y')
    return traces
  }, [data, s1, s2, ct1, ct2, ma1, ma2])

  useEffect(() => {
    if (!ready || !ref.current || !data.length) return
    const traces = buildTraces()
    const dual   = s2 && s2 !== s1
    const layout = {
      paper_bgcolor:'transparent', plot_bgcolor:'transparent',
      font:{ family:'DM Sans,sans-serif', color:'#55556a', size:11 },
      margin:{ t:12, r: dual ? 55 : 12, b:44, l:55 },
      xaxis:{ gridcolor:'#1a1a24', tickcolor:'#24243a', linecolor:'#24243a', tickfont:{size:10}, showgrid:true },
      yaxis:{ gridcolor:'#1a1a24', tickcolor:'#24243a', linecolor:'#24243a', tickfont:{size:10}, showgrid:true, zeroline:false },
      ...(dual ? { yaxis2:{
        overlaying:'y', side:'right', gridcolor:'transparent',
        tickfont:{size:10, color:COLORS[1]}, zeroline:false, showgrid:false, linecolor:'#24243a',
      }} : {}),
      legend:{ x:0, y:-0.16, orientation:'h', bgcolor:'transparent', font:{size:10, color:'#55556a'} },
      hovermode:'x unified',
      hoverlabel:{ bgcolor:'var(--ink-800)', bordercolor:'var(--ink-700)', font:{family:'DM Sans',size:12,color:'#e8e8f0'} },
    }
    const config = {
      responsive:true, displaylogo:false,
      modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'],
      toImageButtonOptions:{ format:'png', filename:`econsur_${dataset.nombre}`, height:700, width:1400, scale:2 },
    }
    if (plotted.current) Plotly.react(ref.current, traces, layout, config)
    else { Plotly.newPlot(ref.current, traces, layout, config); plotted.current = true }
  }, [ready, buildTraces, s1, s2, dataset])

  const dlPng = async () => {
    if (!ref.current) return
    await loadPlotly()
    Plotly.downloadImage(ref.current, { format:'png', filename:`econsur_${dataset.nombre}`, height:700, width:1400, scale:2 })
  }

  const SerieSelect = ({ value, onChange, label, color }) => (
    <div>
      <div style={{ fontSize:11, fontWeight:500, color, marginBottom:5 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        background:'var(--ink-800)', border:'1px solid var(--ink-700)',
        color:'#e8e8f0', borderRadius:8, padding:'5px 28px 5px 8px', fontSize:12,
      }}>
        {label.includes('opcional') && <option value="">— Ninguna —</option>}
        {!label.includes('opcional') && <option value="">—</option>}
        {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
      </select>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:12 }}>

      {/* ── Controles ── */}
      <div style={{
        display:'flex', flexWrap:'wrap', gap:16, alignItems:'flex-end',
        padding:'10px 14px', borderRadius:10,
        background:'var(--ink-900)', border:'1px solid var(--ink-800)',
        flexShrink:0,
      }}>
        {/* Serie 1 */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <SerieSelect value={s1} onChange={setS1} label="Serie 1" color="var(--gold)" />
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {[['scatter','Línea'],['bar','Barras'],['scatter-area','Área']].map(([v,l]) => (
              <CtrlBtn key={v} active={ct1===v} onClick={() => setCt1(v)} color="var(--gold)">{l}</CtrlBtn>
            ))}
            <div style={{ width:1, background:'var(--ink-700)', margin:'0 2px' }} />
            {[[0,'Sin MM'],[3,'MM3'],[4,'MM4'],[12,'MM12']].map(([v,l]) => (
              <CtrlBtn key={v} active={ma1===v} onClick={() => setMa1(v)} color="var(--gold)">{l}</CtrlBtn>
            ))}
          </div>
        </div>

        {/* Separador vertical */}
        <div style={{ width:1, background:'var(--ink-700)', alignSelf:'stretch', margin:'0 4px' }} />

        {/* Serie 2 */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <SerieSelect value={s2} onChange={setS2} label="Serie 2 (opcional)" color="var(--teal)" />
          {s2 && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {[['scatter','Línea'],['bar','Barras'],['scatter-area','Área']].map(([v,l]) => (
                <CtrlBtn key={v} active={ct2===v} onClick={() => setCt2(v)} color="var(--teal)">{l}</CtrlBtn>
              ))}
              <div style={{ width:1, background:'var(--ink-700)', margin:'0 2px' }} />
              {[[0,'Sin MM'],[3,'MM3'],[4,'MM4'],[12,'MM12']].map(([v,l]) => (
                <CtrlBtn key={v} active={ma2===v} onClick={() => setMa2(v)} color="var(--teal)">{l}</CtrlBtn>
              ))}
            </div>
          )}
        </div>

        {/* PNG button — alineado a la derecha */}
        <div style={{ marginLeft:'auto' }}>
          <button onClick={dlPng} style={{
            display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
            borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer',
            background:'var(--ink-800)', border:'1px solid var(--ink-700)', color:'#88889a',
            transition:'border-color 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor='var(--teal)'}
          onMouseLeave={e => e.currentTarget.style.borderColor='var(--ink-700)'}>
            <ImgIcon /> Exportar PNG
          </button>
        </div>
      </div>

      {/* ── Gráfico ── */}
      <div style={{
        flex:1, borderRadius:10, overflow:'hidden',
        background:'var(--ink-900)', border:'1px solid var(--ink-800)',
        minHeight:0,  /* crítico para que flex funcione bien */
      }}>
        {!data.length
          ? <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#2a2a3e', fontSize:13 }}>
              Sin datos disponibles
            </div>
          : <div ref={ref} style={{ width:'100%', height:'100%' }} />
        }
      </div>
    </div>
  )
}

const ImgIcon = () => (
  <svg style={{width:13,height:13}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
  </svg>
)
