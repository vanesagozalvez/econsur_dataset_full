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

// ── Paletas ──────────────────────────────────────────────────────────────────
// Web oscuro — vibrantes sobre fondo negro
const PAL_DARK  = ['#e8a820','#20c4ab','#9b7ef8','#e85454','#30b8d8','#d47820']
// Web claro — idéntico al estilo editorial de la referencia
const PAL_LIGHT = ['#7a1a2e','#1a6b3a','#1a3a7a','#7a4a00','#5a0050','#2a5a50']
// Exportación — mismo estilo editorial (bordeaux, verde oscuro, azul marino)
const PAL_EXPORT = ['#7a1a2e','#1a6b3a','#1a3a7a','#7a4a00','#5a0050','#2a5a50']

// Fondo crema exacto de la referencia
const CREAM = '#f5f0e8'
const CREAM_GRID = '#e8e0ce'

const ASPECT_OPTS = [
  { key:'web',      label:'Web',      icon:'⬛', ratio:null,  w:1400, h:650  },
  { key:'report',   label:'Reporte',  icon:'📄', ratio:'4/3', w:1200, h:900  },
  { key:'square',   label:'Cuadrado', icon:'⬜', ratio:'1/1', w:900,  h:900  },
  { key:'portrait', label:'Vertical', icon:'📱', ratio:'3/4', w:900,  h:1200 },
]

const CHART_TYPES = [['scatter','Línea'],['bar','Barras'],['scatter-area','Área']]
const MA_OPTS     = [[0,'Sin MM'],[3,'MM3'],[4,'MM4'],[12,'MM12']]

const Btn = ({ active, onClick, color, children }) => (
  <button onClick={onClick} style={{
    padding:'3px 8px', borderRadius:7, fontSize:11, fontWeight:500, cursor:'pointer',
    background: active ? color+'22' : 'var(--ink-800)',
    color: active ? color : 'var(--text-muted)',
    border: active ? `1px solid ${color}55` : '1px solid var(--border-subtle)',
    transition:'all 0.1s', whiteSpace:'nowrap',
  }}>{children}</button>
)

// ── Genera el layout estilo editorial (igual en pantalla y exportación) ───────
function buildEditorialLayout({
  forExport = false,
  isDark    = true,
  hasDual   = false,
  palette   = PAL_EXPORT,
  nombre    = '',
  desde     = '',
  hasta     = '',
  aspOpt    = {},
}) {
  const bg          = forExport || !isDark ? CREAM : 'transparent'
  const paperBg     = forExport || !isDark ? CREAM : 'transparent'
  const axisLineCol = forExport || !isDark ? '#888070' : '#44446a'
  const tickCol     = forExport || !isDark ? '#6a6050' : '#88889a'
  const fontFamily  = 'Arial,Helvetica,sans-serif'
  const fontSize    = forExport ? 12 : 10

  // Eje X: solo línea inferior visible, sin grilla vertical
  const xAxis = {
    showgrid:   false,
    showline:   true,
    linecolor:  axisLineCol,
    linewidth:  forExport ? 1.5 : 1,
    mirror:     false,
    zeroline:   false,
    tickfont:   { family: fontFamily, size: fontSize, color: tickCol },
    tickcolor:  axisLineCol,
    ticks:      'outside',
    ticklen:    4,
    tickwidth:  1,
  }

  // Eje Y: sin línea lateral, con grilla horizontal muy sutil
  const yAxis = {
    showgrid:   true,
    gridcolor:  forExport || !isDark ? CREAM_GRID : '#1a1a28',
    gridwidth:  forExport ? 0.8 : 0.5,
    showline:   false,
    zeroline:   true,
    zerolinecolor: forExport || !isDark ? '#aaa090' : '#2a2a40',
    zerolinewidth: forExport ? 1 : 0.5,
    tickfont:   { family: fontFamily, size: fontSize, color: tickCol },
    tickcolor:  axisLineCol,
    ticks:      'outside',
    ticklen:    4,
    tickwidth:  1,
  }

  const yAxis2 = hasDual ? {
    overlaying: 'y',
    side:       'right',
    showgrid:   false,
    showline:   false,
    zeroline:   true,
    zerolinecolor: forExport || !isDark ? '#aaa090' : '#2a2a40',
    zerolinewidth: 0.5,
    tickfont:   { family: fontFamily, size: fontSize, color: palette[1] },
    tickcolor:  palette[1],
    ticks:      'outside',
    ticklen:    4,
  } : undefined

  // Márgenes generosos arriba para el header editorial
  const marginTop = forExport ? 90 : 16

  return {
    paper_bgcolor: paperBg,
    plot_bgcolor:  bg,
    font: { family: fontFamily, color: tickCol, size: fontSize },
    margin: {
      t: marginTop,
      r: hasDual ? 70 : (forExport ? 30 : 16),
      b: forExport ? 72 : 52,
      l: forExport ? 72 : 60,
    },
    xaxis: xAxis,
    yaxis: yAxis,
    ...(hasDual && yAxis2 ? { yaxis2: yAxis2 } : {}),
    legend: {
      x:           0,
      y:           forExport ? -0.14 : -0.18,
      orientation: 'h',
      bgcolor:     'transparent',
      font:        { family: fontFamily, size: forExport ? 12 : 10, color: tickCol },
      traceorder:  'normal',
    },
    hovermode:    'x unified',
    hoverlabel: {
      bgcolor:    forExport || !isDark ? '#ffffff' : '#1a1a2e',
      bordercolor: forExport || !isDark ? '#ccbbaa' : '#44446a',
      font: { family: fontFamily, size: 12, color: forExport || !isDark ? '#1a1a1a' : '#e8e8f0' },
    },
    // Header editorial solo en exportación
    ...(forExport ? {
      annotations: [
        {
          xref: 'paper', yref: 'paper',
          x: 0, y: 1.0,
          xanchor: 'left', yanchor: 'bottom',
          text: `<b>ECONSUR · DATASET STUDIO</b>`,
          font: { family: fontFamily, size: 13, color: '#3a3020' },
          showarrow: false,
        },
        {
          xref: 'paper', yref: 'paper',
          x: 0, y: 0.945,
          xanchor: 'left', yanchor: 'bottom',
          text: `${nombre.toUpperCase()}  (${desde?.slice(0,4) || ''}–${hasta?.slice(0,4) || ''})`,
          font: { family: fontFamily, size: 11, color: '#6a6050' },
          showarrow: false,
        },
        {
          xref: 'paper', yref: 'paper',
          x: 1, y: 1.0,
          xanchor: 'right', yanchor: 'bottom',
          text: 'ECONSUR RESEARCH',
          font: { family: fontFamily, size: 10, color: '#9a8a70' },
          showarrow: false,
        },
      ],
      shapes: [
        // Línea divisora bajo el header
        {
          type: 'line', xref: 'paper', yref: 'paper',
          x0: 0, x1: 1, y0: 0.93, y1: 0.93,
          line: { color: '#8a7a60', width: 1.5 },
        },
      ],
    } : {}),
  }
}

// ── Construye trazas con estilo editorial ────────────────────────────────────
function buildEditorialTraces({ data, s1,s2,s3, ct1,ct2,ct3, ma1,ma2,ma3, palette, forExport }) {
  const traces = []
  const xs = data.map(d => d.periodo)

  const addTrace = (lbl, ct, ma, ci, yaxis) => {
    if (!lbl) return
    const ys    = data.map(d => d[lbl])
    const color = palette[ci % palette.length]
    const lw    = forExport ? 2 : 2.5

    if (ct === 'bar') {
      traces.push({
        x: xs, y: ys, name: lbl, yaxis, type: 'bar',
        marker: { color: color + 'aa', line: { color, width: 1 } },
      })
    } else {
      traces.push({
        x: xs, y: ys, name: lbl, yaxis,
        type: 'scatter', mode: 'lines',
        line: { color, width: lw, shape: 'linear' },
        ...(ct === 'scatter-area' ? { fill: 'tozeroy', fillcolor: color + '20' } : {}),
      })
    }

    if (ma > 0) {
      traces.push({
        x: xs, y: sma(ys, ma),
        name: `${lbl} MM${ma}`, yaxis,
        type: 'scatter', mode: 'lines',
        line: { color, width: forExport ? 1.5 : 1.5, dash: 'dot' },
        opacity: 0.8,
      })
    }
  }

  addTrace(s1, ct1, ma1, 0, 'y')
  addTrace(s2, ct2, ma2, 1, s2 && s2 !== s1 ? 'y2' : 'y')
  addTrace(s3, ct3, ma3, 2, s3 && s3 !== s1 && s3 !== s2 ? 'y2' : 'y')
  return traces
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function ChartPanel({ dataset }) {
  const ref     = useRef(null)
  const plotted = useRef(false)
  const cols    = dataset?.result?.columnas || []
  const data    = dataset?.result?.data     || []

  const [s1,    setS1]    = useState(cols[0]?.label || '')
  const [s2,    setS2]    = useState('')
  const [s3,    setS3]    = useState('')
  const [ct1,   setCt1]   = useState('scatter')
  const [ct2,   setCt2]   = useState('scatter')
  const [ct3,   setCt3]   = useState('scatter')
  const [ma1,   setMa1]   = useState(0)
  const [ma2,   setMa2]   = useState(0)
  const [ma3,   setMa3]   = useState(0)
  const [aspect, setAspect] = useState('web')
  const [ready,  setReady]  = useState(false)

  useEffect(() => { loadPlotly().then(() => setReady(true)) }, [])
  useEffect(() => {
    if (cols.length) { setS1(cols[0]?.label || ''); setS2(''); setS3('') }
  }, [dataset])

  const getIsDark = () => document.documentElement.getAttribute('data-theme') !== 'light'

  const renderChart = useCallback((forExport = false) => {
    const isDark  = getIsDark()
    const palette = forExport ? PAL_EXPORT : (isDark ? PAL_DARK : PAL_LIGHT)
    const hasDual = (s2 && s2 !== s1) || (s3 && s3 !== s1 && s3 !== s2)
    const aspOpt  = ASPECT_OPTS.find(a => a.key === aspect)

    const traces = buildEditorialTraces({ data, s1,s2,s3, ct1,ct2,ct3, ma1,ma2,ma3, palette, forExport })
    const layout = buildEditorialLayout({
      forExport, isDark, hasDual, palette, aspOpt,
      nombre: dataset?.nombre || '',
      desde:  dataset?.desde  || '',
      hasta:  dataset?.hasta  || '',
    })
    return { traces, layout }
  }, [data, s1, s2, s3, ct1, ct2, ct3, ma1, ma2, ma3, aspect, dataset])

  // Renderizar gráfico interactivo
  useEffect(() => {
    if (!ready || !ref.current || !data.length) return
    const { traces, layout } = renderChart(false)
    const aspOpt = ASPECT_OPTS.find(a => a.key === aspect)
    const config = {
      responsive: true, displaylogo: false,
      modeBarButtonsToRemove: ['select2d','lasso2d','autoScale2d'],
      toImageButtonOptions: {
        format: 'png', filename: `econsur_${dataset.nombre}`,
        height: aspOpt.h, width: aspOpt.w, scale: 2,
      },
    }
    if (plotted.current) Plotly.react(ref.current, traces, layout, config)
    else { Plotly.newPlot(ref.current, traces, layout, config); plotted.current = true }
  }, [ready, renderChart, aspect, dataset])

  // Exportar PNG con estilo editorial + fondo crema
  const dlPng = async () => {
    if (!ref.current) return
    await loadPlotly()
    const aspOpt          = ASPECT_OPTS.find(a => a.key === aspect)
    const { traces, layout } = renderChart(true)

    const tmpDiv = document.createElement('div')
    tmpDiv.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${aspOpt.w}px;height:${aspOpt.h}px;`
    document.body.appendChild(tmpDiv)
    try {
      await Plotly.newPlot(tmpDiv, traces, layout, { staticPlot: true, responsive: false })
      await Plotly.downloadImage(tmpDiv, {
        format:   'png',
        filename: `econsur_${dataset.nombre}_${aspect}`,
        height:   aspOpt.h,
        width:    aspOpt.w,
        scale:    2,
      })
    } finally {
      Plotly.purge(tmpDiv)
      document.body.removeChild(tmpDiv)
    }
  }

  const isDark  = getIsDark()
  const palette = isDark ? PAL_DARK : PAL_LIGHT
  const aspOpt  = ASPECT_OPTS.find(a => a.key === aspect)

  // ── Subcomponente de control de una serie ──
  const SerieCtrl = ({ s, setS, ct, setCt, ma, setMa, idx, label }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.04em',
                    color: palette[idx % palette.length] }}>
        {label}
      </div>
      <select value={s} onChange={e => setS(e.target.value)} style={{
        background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
        color:'var(--text-primary)', borderRadius:8,
        padding:'5px 28px 5px 8px', fontSize:12, width:'100%',
      }}>
        {idx > 0 && <option value="">— Ninguna —</option>}
        {idx === 0 && <option value="">—</option>}
        {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
      </select>
      <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
        {CHART_TYPES.map(([v,l]) => (
          <Btn key={v} active={ct===v} onClick={() => setCt(v)}
               color={palette[idx % palette.length]}>{l}</Btn>
        ))}
      </div>
      <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
        {MA_OPTS.map(([v,l]) => (
          <Btn key={v} active={ma===v} onClick={() => setMa(v)}
               color={palette[idx % palette.length]}>{l}</Btn>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100%', gap:12, minHeight:0 }}>

      {/* ── ÁREA DEL GRÁFICO ── */}
      <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0, gap:10, minHeight:0 }}>

        {/* Barra: proporciones + exportar */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'7px 12px', borderRadius:8, flexShrink:0,
          background:'var(--ink-900)', border:'1px solid var(--border)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', marginRight:2 }}>Proporción:</span>
            {ASPECT_OPTS.map(a => (
              <Btn key={a.key} active={aspect===a.key} onClick={() => setAspect(a.key)} color="var(--teal)">
                {a.icon} {a.label}
              </Btn>
            ))}
          </div>
          <button onClick={dlPng}
            title="Exporta con fondo crema y estilo editorial — óptimo para documentos e informes"
            style={{
              display:'flex', alignItems:'center', gap:6, padding:'5px 12px',
              borderRadius:7, fontSize:12, fontWeight:500, cursor:'pointer',
              background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
              color:'var(--text-secondary)', transition:'border-color 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--teal)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--border-subtle)'}>
            <PngIcon /> Exportar PNG
            <span style={{ fontSize:10, opacity:.55, marginLeft:2 }}>(estilo reporte)</span>
          </button>
        </div>

        {/* Gráfico */}
        <div style={{
          flex: aspOpt.ratio ? '0 0 auto' : 1,
          display:'flex', alignItems:'center', justifyContent:'center',
          minHeight: 0,
        }}>
          <div style={{
            width:'100%',
            aspectRatio: aspOpt.ratio || undefined,
            height: aspOpt.ratio ? undefined : '100%',
            maxHeight: aspOpt.ratio ? 'calc(100vh - 240px)' : undefined,
            borderRadius:10, overflow:'hidden',
            background: isDark ? 'var(--ink-900)' : CREAM,
            border:'1px solid var(--border)',
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

      {/* ── PANEL LATERAL ── */}
      <div style={{
        width:220, flexShrink:0, display:'flex', flexDirection:'column', gap:14,
        padding:'12px 14px', borderRadius:10, overflowY:'auto',
        background:'var(--ink-900)', border:'1px solid var(--border)',
        alignSelf:'flex-start',
      }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)',
                      letterSpacing:'.06em', borderBottom:'1px solid var(--border)',
                      paddingBottom:8 }}>
          Series del gráfico
        </div>

        <SerieCtrl s={s1} setS={setS1} ct={ct1} setCt={setCt1} ma={ma1} setMa={setMa1}
                   idx={0} label="Serie 1" />
        <div style={{ height:1, background:'var(--border)' }} />
        <SerieCtrl s={s2} setS={setS2} ct={ct2} setCt={setCt2} ma={ma2} setMa={setMa2}
                   idx={1} label="Serie 2 (opcional)" />
        <div style={{ height:1, background:'var(--border)' }} />
        <SerieCtrl s={s3} setS={setS3} ct={ct3} setCt={setCt3} ma={ma3} setMa={setMa3}
                   idx={2} label="Serie 3 (opcional)" />

        <div style={{
          marginTop:4, padding:'8px 10px', borderRadius:8, fontSize:11,
          background: isDark ? '#0f1a12' : '#f0ece0',
          border:`1px solid ${isDark ? '#1a3a20' : '#c8b890'}`,
          color:'var(--text-muted)', lineHeight:1.5,
        }}>
          📋 PNG exportado con <strong>fondo crema</strong> y header editorial — listo para informes.
        </div>
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
