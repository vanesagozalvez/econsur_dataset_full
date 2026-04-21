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

const SERIES_COLORS = ['#e8a820','#38d9c0','#a78bfa','#ff7c7c','#60d4f0','#f0a060']
const CHART_TYPES   = [['scatter','Línea'],['bar','Barras'],['scatter-area','Área']]
const MA_OPTS       = [[0,'Sin MM'],[3,'MM3'],[4,'MM4'],[12,'MM12']]
const ASPECT_OPTS   = [
  { key:'web',     label:'Web',     icon:'⬛', ratio: null,    w:1400, h:700  },
  { key:'report',  label:'Reporte', icon:'📄', ratio:'4/3',   w:1200, h:900  },
  { key:'square',  label:'Cuadrado',icon:'⬜', ratio:'1/1',   w:900,  h:900  },
  { key:'portrait',label:'Vertical',icon:'📱', ratio:'3/4',   w:900,  h:1200 },
]

/* ── Botón de control reutilizable ── */
const Btn = ({ active, onClick, color, small, children }) => (
  <button onClick={onClick} style={{
    padding: small ? '3px 8px' : '5px 10px',
    borderRadius:7, fontSize: small ? 11 : 12,
    fontWeight:500, cursor:'pointer',
    background: active ? color+'22' : 'var(--ink-800)',
    color: active ? color : 'var(--text-muted)',
    border: active ? `1px solid ${color}55` : '1px solid var(--border-subtle)',
    transition:'all 0.1s', whiteSpace:'nowrap',
  }}>{children}</button>
)

/* ── Config de una sola serie ── */
function SerieConfig({ label, color, series, cols, ct, setCt, ma, setMa, showSerie3, onAddSerie3 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ fontSize:11, fontWeight:600, color, letterSpacing:'.04em' }}>{label}</div>
      {/* Selector */}
      <select value={series} onChange={e => setCt(e.target.value, 'serie')}
        style={{
          background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
          color:'var(--text-primary)', borderRadius:8,
          padding:'5px 28px 5px 8px', fontSize:12, width:'100%',
        }}>
        {label.includes('opcional') && <option value="">— Ninguna —</option>}
        {!label.includes('opcional') && <option value="">—</option>}
        {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
      </select>
      {/* Tipo y MM en la misma fila */}
      <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
        {CHART_TYPES.map(([v,l]) => (
          <Btn key={v} small active={ct===v} onClick={() => setCt(v)} color={color}>{l}</Btn>
        ))}
        <div style={{ width:1, background:'var(--border)', margin:'0 2px', alignSelf:'stretch' }}/>
        {MA_OPTS.map(([v,l]) => (
          <Btn key={v} small active={ma===v} onClick={() => setMa(v)} color={color}>{l}</Btn>
        ))}
      </div>
    </div>
  )
}

export default function ChartPanel({ dataset }) {
  const ref     = useRef(null)
  const plotted = useRef(false)
  const cols    = dataset?.result?.columnas || []
  const data    = dataset?.result?.data     || []

  const [s1,      setS1]      = useState(cols[0]?.label || '')
  const [s2,      setS2]      = useState('')
  const [s3,      setS3]      = useState('')
  const [ct1,     setCt1]     = useState('scatter')
  const [ct2,     setCt2]     = useState('scatter')
  const [ct3,     setCt3]     = useState('scatter')
  const [ma1,     setMa1]     = useState(0)
  const [ma2,     setMa2]     = useState(0)
  const [ma3,     setMa3]     = useState(0)
  const [aspect,  setAspect]  = useState('web')
  const [ready,   setReady]   = useState(false)

  useEffect(() => { loadPlotly().then(() => setReady(true)) }, [])
  useEffect(() => {
    if (cols.length) { setS1(cols[0]?.label || ''); setS2(''); setS3('') }
  }, [dataset])

  const buildTraces = useCallback(() => {
    const traces = []
    const xs = data.map(d => d.periodo)

    const addTrace = (lbl, ct, ma, colorIdx, yaxis) => {
      if (!lbl) return
      const ys    = data.map(d => d[lbl])
      const color = SERIES_COLORS[colorIdx % SERIES_COLORS.length]
      if (ct === 'bar') {
        traces.push({ x:xs, y:ys, name:lbl, yaxis, type:'bar',
          marker:{ color: color+'99', line:{ color, width:1 } } })
      } else {
        traces.push({ x:xs, y:ys, name:lbl, yaxis, type:'scatter', mode:'lines',
          line:{ color, width:2.5 },
          ...(ct==='scatter-area' ? { fill:'tozeroy', fillcolor: color+'15' } : {}) })
      }
      if (ma > 0) {
        traces.push({ x:xs, y:sma(ys, ma), name:`${lbl} MM${ma}`, yaxis,
          type:'scatter', mode:'lines',
          line:{ color, width:1.5, dash:'dot' }, opacity:0.8 })
      }
    }

    // Determinar ejes: s1 siempre en y, s2 y s3 comparten y2 si son distintos de s1
    addTrace(s1, ct1, ma1, 0, 'y')
    addTrace(s2, ct2, ma2, 1, s2 && s2!==s1 ? 'y2' : 'y')
    addTrace(s3, ct3, ma3, 2, s3 && s3!==s1 && s3!==s2 ? 'y2' : 'y')
    return traces
  }, [data, s1, s2, s3, ct1, ct2, ct3, ma1, ma2, ma3])

  // Detectar tema del documento
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  const gridColor  = isDark ? '#1a1a24' : '#e8e8f0'
  const tickColor  = isDark ? '#24243a' : '#d0d0e0'
  const fontColor  = isDark ? '#55556a' : '#6a6a8a'
  const bgColor    = 'transparent'
  const hoverBg    = isDark ? '#1a1a24' : '#ffffff'
  const hoverBorder= isDark ? '#32324e' : '#d0d0e0'

  useEffect(() => {
    if (!ready || !ref.current || !data.length) return
    const traces  = buildTraces()
    const hasDual = (s2 && s2!==s1) || (s3 && s3!==s1 && s3!==s2)
    const layout  = {
      paper_bgcolor: bgColor, plot_bgcolor: bgColor,
      font:{ family:'DM Sans,sans-serif', color: fontColor, size:11 },
      margin:{ t:16, r: hasDual ? 60 : 16, b:48, l:60 },
      xaxis:{ gridcolor: gridColor, tickcolor: tickColor, linecolor: tickColor,
              tickfont:{ size:10 }, showgrid:true },
      yaxis:{ gridcolor: gridColor, tickcolor: tickColor, linecolor: tickColor,
              tickfont:{ size:10 }, showgrid:true, zeroline:false },
      ...(hasDual ? { yaxis2:{
        overlaying:'y', side:'right', gridcolor:'transparent',
        tickfont:{ size:10, color: SERIES_COLORS[1] },
        zeroline:false, showgrid:false, linecolor: tickColor,
      }} : {}),
      legend:{ x:0, y:-0.18, orientation:'h', bgcolor:'transparent',
               font:{ size:10, color: fontColor } },
      hovermode:'x unified',
      hoverlabel:{ bgcolor: hoverBg, bordercolor: hoverBorder,
                   font:{ family:'DM Sans', size:12, color: isDark ? '#e8e8f0' : '#1a1a2e' } },
    }
    const aspOpt = ASPECT_OPTS.find(a => a.key === aspect)
    const config  = {
      responsive:true, displaylogo:false,
      modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'],
      toImageButtonOptions:{
        format:'png', filename:`econsur_${dataset.nombre}`,
        height: aspOpt.h, width: aspOpt.w, scale:2,
      },
    }
    if (plotted.current) Plotly.react(ref.current, traces, layout, config)
    else { Plotly.newPlot(ref.current, traces, layout, config); plotted.current = true }
    plotted.current = true
  }, [ready, buildTraces, s1, s2, s3, dataset, aspect, isDark])

  const dlPng = async () => {
    if (!ref.current) return
    await loadPlotly()
    const aspOpt = ASPECT_OPTS.find(a => a.key === aspect)
    Plotly.downloadImage(ref.current, {
      format:'png', filename:`econsur_${dataset.nombre}_${aspect}`,
      height: aspOpt.h, width: aspOpt.w, scale:2,
    })
  }

  const aspOpt = ASPECT_OPTS.find(a => a.key === aspect)

  return (
    <div style={{ display:'flex', height:'100%', gap:12, minHeight:0 }}>

      {/* ══ ÁREA DEL GRÁFICO ══ */}
      <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0, gap:10, minHeight:0 }}>

        {/* Aspect ratio toggle + PNG — barra superior compacta */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'7px 12px', borderRadius:8, flexShrink:0,
          background:'var(--ink-900)', border:'1px solid var(--border)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', marginRight:4 }}>Proporción:</span>
            {ASPECT_OPTS.map(a => (
              <Btn key={a.key} small active={aspect===a.key} onClick={() => setAspect(a.key)} color="var(--teal)">
                {a.icon} {a.label}
              </Btn>
            ))}
          </div>
          <button onClick={dlPng} style={{
            display:'flex', alignItems:'center', gap:6, padding:'5px 12px',
            borderRadius:7, fontSize:12, fontWeight:500, cursor:'pointer',
            background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
            color:'var(--text-secondary)', transition:'border-color 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor='var(--teal)'}
          onMouseLeave={e => e.currentTarget.style.borderColor='var(--border-subtle)'}>
            <PngIcon /> Exportar PNG
          </button>
        </div>

        {/* Gráfico con proporción controlada */}
        <div style={{
          flex: aspOpt.ratio ? '0 0 auto' : 1,
          display:'flex', alignItems:'center', justifyContent:'center',
          minHeight:0,
        }}>
          <div style={{
            width: '100%',
            aspectRatio: aspOpt.ratio || undefined,
            height: aspOpt.ratio ? undefined : '100%',
            maxHeight: aspOpt.ratio ? 'calc(100vh - 240px)' : undefined,
            borderRadius:10, overflow:'hidden',
            background:'var(--ink-900)', border:'1px solid var(--border)',
          }}>
            {!data.length
              ? <div style={{ height:'100%', display:'flex', alignItems:'center',
                              justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
                  Sin datos disponibles
                </div>
              : <div ref={ref} style={{ width:'100%', height:'100%' }} />
            }
          </div>
        </div>
      </div>

      {/* ══ PANEL LATERAL DE CONTROLES ══ */}
      <div style={{
        width:220, flexShrink:0, display:'flex', flexDirection:'column', gap:14,
        padding:'12px 14px', borderRadius:10, overflowY:'auto',
        background:'var(--ink-900)', border:'1px solid var(--border)',
        alignSelf:'flex-start',   /* no estira si el gráfico es más alto */
      }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)',
                      letterSpacing:'.06em', borderBottom:'1px solid var(--border)',
                      paddingBottom:8 }}>
          Series del gráfico
        </div>

        {/* Serie 1 */}
        <SerieConfig
          label="Serie 1" color={SERIES_COLORS[0]}
          series={s1} cols={cols}
          ct={ct1} setCt={(v) => setCt1(v)}
          ma={ma1} setMa={setMa1}
        />
        {/* Override selector */}
        <select value={s1} onChange={e => setS1(e.target.value)} style={{
          background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
          color:'var(--text-primary)', borderRadius:8,
          padding:'5px 28px 5px 8px', fontSize:12, width:'100%', marginTop:-10,
        }}>
          <option value="">—</option>
          {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
        </select>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {CHART_TYPES.map(([v,l]) => (
              <Btn key={v} small active={ct1===v} onClick={() => setCt1(v)} color={SERIES_COLORS[0]}>{l}</Btn>
            ))}
          </div>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {MA_OPTS.map(([v,l]) => (
              <Btn key={v} small active={ma1===v} onClick={() => setMa1(v)} color={SERIES_COLORS[0]}>{l}</Btn>
            ))}
          </div>
        </div>

        <div style={{ height:1, background:'var(--border)' }} />

        {/* Serie 2 */}
        <div style={{ fontSize:11, fontWeight:600, color: SERIES_COLORS[1], letterSpacing:'.04em' }}>
          Serie 2 <span style={{ fontWeight:400, opacity:.6 }}>(opcional)</span>
        </div>
        <select value={s2} onChange={e => setS2(e.target.value)} style={{
          background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
          color:'var(--text-primary)', borderRadius:8,
          padding:'5px 28px 5px 8px', fontSize:12, width:'100%', marginTop:-10,
        }}>
          <option value="">— Ninguna —</option>
          {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
        </select>
        {s2 && (
          <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:-6 }}>
            <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
              {CHART_TYPES.map(([v,l]) => (
                <Btn key={v} small active={ct2===v} onClick={() => setCt2(v)} color={SERIES_COLORS[1]}>{l}</Btn>
              ))}
            </div>
            <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
              {MA_OPTS.map(([v,l]) => (
                <Btn key={v} small active={ma2===v} onClick={() => setMa2(v)} color={SERIES_COLORS[1]}>{l}</Btn>
              ))}
            </div>
          </div>
        )}

        <div style={{ height:1, background:'var(--border)' }} />

        {/* Serie 3 */}
        <div style={{ fontSize:11, fontWeight:600, color: SERIES_COLORS[2], letterSpacing:'.04em' }}>
          Serie 3 <span style={{ fontWeight:400, opacity:.6 }}>(opcional)</span>
        </div>
        <select value={s3} onChange={e => setS3(e.target.value)} style={{
          background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
          color:'var(--text-primary)', borderRadius:8,
          padding:'5px 28px 5px 8px', fontSize:12, width:'100%', marginTop:-10,
        }}>
          <option value="">— Ninguna —</option>
          {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
        </select>
        {s3 && (
          <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:-6 }}>
            <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
              {CHART_TYPES.map(([v,l]) => (
                <Btn key={v} small active={ct3===v} onClick={() => setCt3(v)} color={SERIES_COLORS[2]}>{l}</Btn>
              ))}
            </div>
            <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
              {MA_OPTS.map(([v,l]) => (
                <Btn key={v} small active={ma3===v} onClick={() => setMa3(v)} color={SERIES_COLORS[2]}>{l}</Btn>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const PngIcon = () => (
  <svg style={{width:13,height:13}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
  </svg>
)

