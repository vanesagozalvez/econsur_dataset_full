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
const TYPES  = [{ v:'scatter', l:'Línea' }, { v:'bar', l:'Barras' }, { v:'scatter-area', l:'Área' }]
const MAS    = [{ v:0, l:'Sin MM' }, { v:3, l:'MM3' }, { v:4, l:'MM4' }, { v:12, l:'MM12' }]

const Btn = ({ active, onClick, color, children }) => (
  <button onClick={onClick}
    className="rounded-lg px-2.5 py-1 text-xs font-medium transition-all"
    style={active
      ? { background: color + '22', color, border:`1px solid ${color}` }
      : { background:'var(--ink-800)', color:'#44446a', border:'1px solid var(--ink-700)' }}>
    {children}
  </button>
)

export default function ChartPanel({ dataset }) {
  const ref    = useRef(null)
  const plotted = useRef(false)
  const cols   = dataset?.result?.columnas || []
  const data   = dataset?.result?.data     || []

  const [s1,  setS1]  = useState(cols[0]?.label || '')
  const [s2,  setS2]  = useState('')
  const [ct1, setCt1] = useState('scatter')
  const [ct2, setCt2] = useState('scatter')
  const [ma1, setMa1] = useState(0)
  const [ma2, setMa2] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => { loadPlotly().then(() => setReady(true)) }, [])
  useEffect(() => { if (cols.length) setS1(cols[0]?.label || '') }, [dataset])

  const buildTraces = useCallback(() => {
    const traces = []
    const xs = data.map(d => d.periodo)
    const add = (lbl, ct, ma, ci, yaxis) => {
      if (!lbl) return
      const ys    = data.map(d => d[lbl])
      const color = COLORS[ci % COLORS.length]
      const isArea = ct === 'scatter-area'
      const base = { x: xs, y: ys, name: lbl, yaxis,
                     line:{ color, width:2 }, marker:{ color } }
      if (ct === 'bar') {
        traces.push({ ...base, type:'bar', marker:{ color: color+'99', line:{ color, width:1 } } })
      } else {
        traces.push({ ...base, type:'scatter', mode:'lines',
          ...(isArea ? { fill:'tozeroy', fillcolor: color+'18' } : {}) })
      }
      if (ma > 0) {
        traces.push({ x: xs, y: sma(ys, ma), name:`${lbl} MM${ma}`, yaxis,
          type:'scatter', mode:'lines', line:{ color, width:1.5, dash:'dot' }, opacity:0.8 })
      }
    }
    add(s1, ct1, ma1, 0, 'y')
    add(s2, ct2, ma2, 1, s2 && s2 !== s1 ? 'y2' : 'y')
    return traces
  }, [data, s1, s2, ct1, ct2, ma1, ma2])

  useEffect(() => {
    if (!ready || !ref.current || !data.length) return
    const traces  = buildTraces()
    const dual    = s2 && s2 !== s1
    const layout  = {
      paper_bgcolor:'transparent', plot_bgcolor:'transparent',
      font:{ family:'DM Sans,sans-serif', color:'#55556a', size:11 },
      margin:{ t:16, r: dual ? 55 : 16, b:48, l:55 },
      xaxis:{ gridcolor:'#1a1a24', tickcolor:'#24243a', linecolor:'#24243a',
              tickfont:{size:10}, showgrid:true },
      yaxis:{ gridcolor:'#1a1a24', tickcolor:'#24243a', linecolor:'#24243a',
              tickfont:{size:10}, showgrid:true, zeroline:false },
      ...(dual ? { yaxis2:{ overlaying:'y', side:'right', gridcolor:'transparent',
                            tickfont:{size:10, color: COLORS[1]}, zeroline:false,
                            showgrid:false, linecolor:'#24243a' } } : {}),
      legend:{ x:0, y:-0.18, orientation:'h', bgcolor:'transparent',
               font:{size:10, color:'#55556a'} },
      hovermode:'x unified',
      hoverlabel:{ bgcolor:'var(--ink-800)', bordercolor:'var(--ink-700)',
                   font:{family:'DM Sans',size:12,color:'#e8e8f0'} },
    }
    const config = {
      responsive:true, displaylogo:false,
      modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'],
      toImageButtonOptions:{ format:'png', filename:`econsur_${dataset.nombre}`,
                             height:600, width:1200, scale:2 },
    }
    if (plotted.current) Plotly.react(ref.current, traces, layout, config)
    else { Plotly.newPlot(ref.current, traces, layout, config); plotted.current = true }
  }, [ready, buildTraces, s1, s2, dataset])

  const dlPng = async () => {
    if (!ref.current) return
    await loadPlotly()
    Plotly.downloadImage(ref.current, { format:'png', filename:`econsur_${dataset.nombre}`,
                                        height:600, width:1200, scale:2 })
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 items-start">
        {/* Serie 1 */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium" style={{ color:'var(--gold)' }}>Serie 1</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={s1} onChange={e => setS1(e.target.value)}
              style={{ background:'var(--ink-800)', border:'1px solid var(--ink-700)',
                       color:'#e8e8f0', borderRadius:8, padding:'5px 28px 5px 8px', fontSize:12 }}>
              <option value="">—</option>
              {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>
            <div className="flex gap-1">
              {TYPES.map(t => <Btn key={t.v} active={ct1===t.v} onClick={()=>setCt1(t.v)} color="var(--gold)">{t.l}</Btn>)}
            </div>
            <div className="flex gap-1">
              {MAS.map(m => <Btn key={m.v} active={ma1===m.v} onClick={()=>setMa1(m.v)} color="var(--gold)">{m.l}</Btn>)}
            </div>
          </div>
        </div>

        {/* Serie 2 */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium" style={{ color:'var(--teal)' }}>Serie 2 (opcional)</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={s2} onChange={e => setS2(e.target.value)}
              style={{ background:'var(--ink-800)', border:'1px solid var(--ink-700)',
                       color:'#e8e8f0', borderRadius:8, padding:'5px 28px 5px 8px', fontSize:12 }}>
              <option value="">— Ninguna —</option>
              {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>
            {s2 && <>
              <div className="flex gap-1">
                {TYPES.map(t => <Btn key={t.v} active={ct2===t.v} onClick={()=>setCt2(t.v)} color="var(--teal)">{t.l}</Btn>)}
              </div>
              <div className="flex gap-1">
                {MAS.map(m => <Btn key={m.v} active={ma2===m.v} onClick={()=>setMa2(m.v)} color="var(--teal)">{m.l}</Btn>)}
              </div>
            </>}
          </div>
        </div>

        {/* PNG */}
        <button onClick={dlPng} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{ background:'var(--ink-800)', border:'1px solid var(--ink-700)', color:'#55556a' }}
          onMouseEnter={e => e.currentTarget.style.borderColor='var(--teal)'}
          onMouseLeave={e => e.currentTarget.style.borderColor='var(--ink-700)'}>
          <ImgIcon /> PNG
        </button>
      </div>

      {/* Chart container */}
      <div className="flex-1 rounded-xl overflow-hidden"
           style={{ minHeight:360, background:'var(--ink-900)', border:'1px solid var(--ink-800)' }}>
        {!data.length
          ? <div className="h-full flex items-center justify-center text-sm" style={{ color:'#2a2a3e' }}>
              Sin datos disponibles
            </div>
          : <div ref={ref} style={{ width:'100%', height:'100%' }} />
        }
      </div>
    </div>
  )
}

const ImgIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
  </svg>
)
