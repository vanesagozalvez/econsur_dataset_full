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

function divideArrays(num, div) {
  return num.map((v, i) => {
    const d = div[i]
    return (v == null || d == null || d === 0) ? null : v / d
  })
}

const PAL_DARK   = ['#e8a820','#20c4ab','#9b7ef8','#e85454','#30b8d8','#d47820']
const PAL_LIGHT  = ['#7a1a2e','#1a6b3a','#1a3a7a','#7a4a00','#5a0050','#2a5a50']
const PAL_EXPORT = ['#7a1a2e','#1a6b3a','#1a3a7a','#7a4a00','#5a0050','#2a5a50']
const CREAM      = '#f5f0e8'
const CREAM_GRID = '#e8e0ce'

const ASPECT_OPTS = [
  { key:'web',      label:'Web',      icon:'⬛', ratio:null,  w:1400, h:650  },
  { key:'report',   label:'Reporte',  icon:'📄', ratio:'4/3', w:1200, h:900  },
  { key:'square',   label:'Cuadrado', icon:'⬜', ratio:'1/1', w:900,  h:900  },
  { key:'portrait', label:'Vertical', icon:'📱', ratio:'3/4', w:900,  h:1200 },
]
const CHART_TYPES = [['scatter','Línea'],['bar','Barras'],['scatter-area','Área']]
const MA_OPTS     = [[0,'Sin MM'],[3,'MM3'],[4,'MM4'],[12,'MM12']]

const Btn = ({ active, onClick, color, children, title }) => (
  <button onClick={onClick} title={title} style={{
    padding:'3px 8px', borderRadius:7, fontSize:11, fontWeight:500, cursor:'pointer',
    background: active ? color+'22' : 'var(--ink-800)',
    color: active ? color : 'var(--text-muted)',
    border: active ? `1px solid ${color}55` : '1px solid var(--border-subtle)',
    transition:'all 0.1s', whiteSpace:'nowrap',
  }}>{children}</button>
)

const Toggle = ({ active, onClick, color, icon, label, title }) => (
  <button onClick={onClick} title={title} style={{
    display:'flex', alignItems:'center', gap:5,
    padding:'4px 9px', borderRadius:7, fontSize:11, fontWeight:500, cursor:'pointer',
    background: active ? color+'20' : 'var(--ink-800)',
    color: active ? color : 'var(--text-muted)',
    border: active ? `1px solid ${color}55` : '1px solid var(--border-subtle)',
    transition:'all 0.12s', whiteSpace:'nowrap',
  }}>
    <span style={{ fontSize:13 }}>{icon}</span>
    {label}
  </button>
)

// ── Tipografías más grandes para el gráfico ──────────────────────────────────
const FONT_WEB    = { family:'Arial,Helvetica,sans-serif', size:15 }
const FONT_EXPORT = { family:'Arial,Helvetica,sans-serif', size:28 }
const TICK_WEB    = { size:17 }
const TICK_EXPORT = { size:24 }

function buildEditorialLayout({ forExport, isDark, hasDual, palette,
                                 nombre, desde, hasta,
                                 autoRange1, autoRange2, yRange1, yRange2,
                                 chartDesde, chartHasta }) {
  const bg       = forExport || !isDark ? CREAM      : 'transparent'
  const paperBg  = forExport || !isDark ? CREAM      : 'transparent'
  const axisLine = forExport || !isDark ? '#888070'  : '#44446a'
  const tickCol  = forExport || !isDark ? '#6a6050'  : '#88889a'
  const gridCol  = forExport || !isDark ? CREAM_GRID : '#1a1a28'
  const fontFam  = 'Arial,Helvetica,sans-serif'
  const tickSize = forExport ? TICK_EXPORT.size : TICK_WEB.size
  const fontBase = forExport ? FONT_EXPORT : FONT_WEB

  const baseAxis = {
    showgrid: true, gridcolor: gridCol, gridwidth: forExport ? 0.8 : 0.5,
    showline: false, zeroline: true,
    zerolinecolor: forExport || !isDark ? '#aaa090' : '#2a2a40',
    zerolinewidth: forExport ? 1 : 0.5,
    tickfont: { family: fontFam, size: tickSize, color: tickCol },
    tickcolor: axisLine, ticks: 'outside', ticklen: 4, tickwidth: 1,
  }
  const xAxisBase = {
    showgrid: false, showline: true,
    linecolor: axisLine, linewidth: forExport ? 1.5 : 1,
    mirror: false, zeroline: false,
    tickfont: { family: fontFam, size: tickSize, color: tickCol },
    tickcolor: axisLine, ticks: 'outside', ticklen: 4, tickwidth: 1,
    // Filtro de fechas del gráfico (independiente del dataset)
    ...(chartDesde ? { range: [chartDesde, chartHasta || undefined] } : {}),
  }

  return {
    paper_bgcolor: paperBg, plot_bgcolor: bg,
    font: { ...fontBase, color: tickCol },
    margin: { t: forExport ? 90 : 16, r: hasDual ? 75 : (forExport ? 30 : 16), b: forExport ? 72 : 52, l: forExport ? 75 : 65 },
    xaxis: { ...xAxisBase },
    yaxis: {
      ...baseAxis,
      tickfont: { family: fontFam, size: tickSize, color: tickCol },
      autorange: autoRange1,
      ...((!autoRange1 && yRange1) ? { range: yRange1 } : {}),
    },
    ...(hasDual ? { yaxis2: {
      ...baseAxis,
      overlaying: 'y', side: 'right', showgrid: false,
      tickfont: { family: fontFam, size: tickSize, color: palette[1] },
      tickcolor: palette[1],
      autorange: autoRange2,
      ...((!autoRange2 && yRange2) ? { range: yRange2 } : {}),
    }} : {}),
    legend: {
      x: 0, y: forExport ? -0.14 : -0.20, orientation: 'h',
      bgcolor: 'transparent',
      font: { family: fontFam, size: forExport ? 13 : 11, color: tickCol },
    },
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor:     forExport || !isDark ? '#ffffff' : '#1a1a2e',
      bordercolor: forExport || !isDark ? '#ccbbaa' : '#44446a',
      font: { family: fontFam, size: 13, color: forExport || !isDark ? '#1a1a1a' : '#e8e8f0' },
    },
    ...(forExport ? {
      annotations: [
        { xref:'paper', yref:'paper', x:0, y:1.0, xanchor:'left', yanchor:'bottom',
          text:'<b>ECONSUR · DATASET STUDIO</b>',
          font:{ family: fontFam, size:14, color:'#3a3020' }, showarrow:false },
        { xref:'paper', yref:'paper', x:0, y:0.942, xanchor:'left', yanchor:'bottom',
          text:`${nombre?.toUpperCase()}  (${desde?.slice(0,4)||''}–${hasta?.slice(0,4)||''})`,
          font:{ family: fontFam, size:12, color:'#6a6050' }, showarrow:false },
        { xref:'paper', yref:'paper', x:1, y:1.0, xanchor:'right', yanchor:'bottom',
          text:'ECONSUR RESEARCH',
          font:{ family: fontFam, size:11, color:'#9a8a70' }, showarrow:false },
      ],
      shapes: [{
        type:'line', xref:'paper', yref:'paper',
        x0:0, x1:1, y0:0.93, y1:0.93,
        line:{ color:'#8a7a60', width:1.5 },
      }],
    } : {}),
  }
}

function buildTraces({ data, s1,s2,s3, ct1,ct2,ct3, ma1,ma2,ma3,
                       ajusteS1, ajusteS2, palette, forExport,
                       hiddenTraces = [] }) {
  const traces = []
  const xs     = data.map(d => d.periodo)
  const ys3Raw = s3 ? data.map(d => d[s3]) : null

  const getValues = (label, ajustar) => {
    const raw = data.map(d => d[label])
    return (ajustar && ys3Raw && s3) ? divideArrays(raw, ys3Raw) : raw
  }

  const addTrace = (lbl, ct, ma, ci, yaxis, ajustar) => {
    if (!lbl) return
    const ys    = getValues(lbl, ajustar)
    const color = palette[ci % palette.length]
    const lw    = forExport ? 2 : 2.5
    const nameLabel = ajustar && s3 ? `${lbl} ÷ ${s3}` : lbl
    // Respetar visibilidad que el usuario activó/desactivó en la leyenda
    const isHidden = hiddenTraces.includes(nameLabel) || hiddenTraces.includes(lbl)
    if (forExport && isHidden) return  // omitir completamente en PNG

    if (ct === 'bar') {
      traces.push({ x:xs, y:ys, name:nameLabel, yaxis, type:'bar',
        marker:{ color: color+(forExport?'bb':'99'), line:{ color, width: forExport?1.5:1 } },
        visible: isHidden ? 'legendonly' : true })
    } else {
      traces.push({ x:xs, y:ys, name:nameLabel, yaxis, type:'scatter', mode:'lines',
        line:{ color, width:lw, shape:'linear' },
        ...(ct==='scatter-area' ? { fill:'tozeroy', fillcolor: color+'20' } : {}),
        visible: isHidden ? 'legendonly' : true })
    }
    if (ma > 0) {
      const maName = `${nameLabel} MM${ma}`
      const maHidden = hiddenTraces.includes(maName)
      if (forExport && maHidden) return
      traces.push({ x:xs, y:sma(ys, ma), name:maName, yaxis,
        type:'scatter', mode:'lines',
        line:{ color, width: forExport ? 1.5 : 1.5, dash:'dot' },
        opacity:0.8,
        visible: maHidden ? 'legendonly' : true })
    }
  }

  addTrace(s1, ct1, ma1, 0, 'y',  ajusteS1)
  addTrace(s2, ct2, ma2, 1, s2 && s2!==s1 ? 'y2' : 'y', ajusteS2)
  if (s3 && !(ajusteS1 && ajusteS2)) {
    addTrace(s3, ct3, ma3, 2, (s3!==s1 && s3!==s2) ? 'y2' : 'y', false)
  }
  return traces
}

export default function ChartPanel({ dataset }) {
  const ref     = useRef(null)
  const plotted = useRef(false)
  const cols    = dataset?.result?.columnas || []
  const data    = dataset?.result?.data     || []

  const [s1,       setS1]       = useState(cols[0]?.label || '')
  const [s2,       setS2]       = useState('')
  const [s3,       setS3]       = useState('')
  const [ct1,      setCt1]      = useState('scatter')
  const [ct2,      setCt2]      = useState('scatter')
  const [ct3,      setCt3]      = useState('scatter')
  const [ma1,      setMa1]      = useState(0)
  const [ma2,      setMa2]      = useState(0)
  const [ma3,      setMa3]      = useState(0)
  const [aspect,   setAspect]   = useState('web')
  const [ready,    setReady]    = useState(false)
  const [autoScale, setAutoScale] = useState(false)
  const [ajusteS1,  setAjusteS1]  = useState(false)
  const [ajusteS2,  setAjusteS2]  = useState(false)
  // Filtro de fechas del gráfico (independiente del dataset)
  const [chartDesde, setChartDesde] = useState('')
  const [chartHasta, setChartHasta] = useState('')

  useEffect(() => { loadPlotly().then(() => setReady(true)) }, [])
  useEffect(() => {
    if (cols.length) { setS1(cols[0]?.label||''); setS2(''); setS3('') }
    setAjusteS1(false); setAjusteS2(false)
    setChartDesde(''); setChartHasta('')
  }, [dataset])
  useEffect(() => { if (!s3) { setAjusteS1(false); setAjusteS2(false) } }, [s3])

  const getIsDark = () => document.documentElement.getAttribute('data-theme') !== 'light'

  // Leer qué trazas están ocultas en el gráfico actual (via legendonly)
  const getHiddenTraces = useCallback(() => {
    if (!ref.current) return []
    try {
      const gd = ref.current
      if (!gd.data) return []
      return gd.data
        .filter(t => t.visible === 'legendonly' || t.visible === false)
        .map(t => t.name)
    } catch { return [] }
  }, [])

  const calcYRange = useCallback((label, ajustar) => {
    if (!label || !data.length) return null
    const ys3 = s3 ? data.map(d => d[s3]) : null
    const vals = data.map(d => {
      const v = d[label]
      if (ajustar && ys3 && s3) {
        const d3 = ys3[data.indexOf(d)]
        return (v != null && d3 != null && d3 !== 0) ? v / d3 : null
      }
      return v
    }).filter(v => v != null)
    if (!vals.length) return null
    const mn = Math.min(...vals), mx = Math.max(...vals)
    const pad = (mx - mn) * 0.08
    return [mn - pad, mx + pad]
  }, [data, s3])

  const renderChart = useCallback((forExport = false, hiddenTraces = []) => {
    const isDark   = getIsDark()
    const palette  = forExport ? PAL_EXPORT : (isDark ? PAL_DARK : PAL_LIGHT)
    const hasDual  = (s2 && s2!==s1) || (s3 && !(ajusteS1 && ajusteS2))
    const aspOpt   = ASPECT_OPTS.find(a => a.key === aspect)

    const traces = buildTraces({ data, s1,s2,s3, ct1,ct2,ct3, ma1,ma2,ma3,
                                  ajusteS1, ajusteS2, palette, forExport, hiddenTraces })
    let autoRange1 = true, autoRange2 = true
    let yRange1 = null, yRange2 = null
    if (autoScale && s1) { autoRange1 = false; yRange1 = calcYRange(s1, ajusteS1) }
    if (autoScale && s2 && hasDual) { autoRange2 = false; yRange2 = calcYRange(s2, ajusteS2) }

    const layout = buildEditorialLayout({
      forExport, isDark, hasDual, palette, aspOpt,
      nombre: dataset?.nombre||'', desde: dataset?.desde||'', hasta: dataset?.hasta||'',
      autoRange1, autoRange2, yRange1, yRange2,
      chartDesde: chartDesde || null,
      chartHasta: chartHasta || null,
    })
    return { traces, layout }
  }, [data, s1,s2,s3, ct1,ct2,ct3, ma1,ma2,ma3,
      ajusteS1, ajusteS2, autoScale, aspect, dataset,
      calcYRange, chartDesde, chartHasta])

  useEffect(() => {
    if (!ready || !ref.current || !data.length) return
    const { traces, layout } = renderChart(false)
    const aspOpt = ASPECT_OPTS.find(a => a.key === aspect)
    const config = {
      responsive:true, displaylogo:false,
      modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'],
      toImageButtonOptions:{ format:'png', filename:`econsur_${dataset.nombre}`,
        height:aspOpt.h, width:aspOpt.w, scale:1 },
    }
    if (plotted.current) Plotly.react(ref.current, traces, layout, config)
    else { Plotly.newPlot(ref.current, traces, layout, config); plotted.current = true }
  }, [ready, renderChart, aspect, dataset])

  // ── Exportar PNG: captura exacta de lo visible en pantalla ───────────────
  const dlPng = async () => {
    if (!ref.current) return
    await loadPlotly()
    const aspOpt      = ASPECT_OPTS.find(a => a.key === aspect)
    const hidden      = getHiddenTraces()          // series ocultas por el usuario
    const { traces, layout } = renderChart(true, hidden)

    const tmpDiv = document.createElement('div')
    tmpDiv.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${aspOpt.w}px;height:${aspOpt.h}px;`
    document.body.appendChild(tmpDiv)
    try {
      await Plotly.newPlot(tmpDiv, traces, layout, { staticPlot:true, responsive:false })
      await Plotly.downloadImage(tmpDiv, {
        format:'png', filename:`econsur_${dataset.nombre}_${aspect}`,
        height:aspOpt.h, width:aspOpt.w, scale:1,
      })
    } finally { Plotly.purge(tmpDiv); document.body.removeChild(tmpDiv) }
  }

  const isDark  = getIsDark()
  const palette = isDark ? PAL_DARK : PAL_LIGHT
  const aspOpt  = ASPECT_OPTS.find(a => a.key === aspect)
  const canAjust = !!s3

  const INPUT_DATE = {
    background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
    color:'var(--text-primary)', borderRadius:7,
    padding:'4px 7px', fontSize:11, width:110,
  }

  const SelectS = ({ value, onChange, includeNone }) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
      color:'var(--text-primary)', borderRadius:8,
      padding:'5px 28px 5px 8px', fontSize:12, width:'100%',
    }}>
      {includeNone && <option value="">— Ninguna —</option>}
      {!includeNone && <option value="">—</option>}
      {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
    </select>
  )

  const DIV = () => <div style={{ height:1, background:'var(--border)' }}/>

  return (
    <div style={{ display:'flex', height:'100%', gap:12, minHeight:0 }}>

      {/* ── GRÁFICO ── */}
      <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0, gap:10, minHeight:0 }}>

        {/* Barra superior */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'6px 12px', borderRadius:8, flexShrink:0,
          background:'var(--ink-900)', border:'1px solid var(--border)',
          flexWrap:'wrap', gap:6,
        }}>
          {/* Izquierda: proporciones + autoescala */}
          <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', marginRight:2 }}>Proporción:</span>
            {ASPECT_OPTS.map(a => (
              <Btn key={a.key} active={aspect===a.key} onClick={() => setAspect(a.key)} color="var(--teal)">
                {a.icon} {a.label}
              </Btn>
            ))}
            <div style={{ width:1, background:'var(--border)', height:18, margin:'0 4px' }}/>
            <Toggle active={autoScale} onClick={() => setAutoScale(v => !v)}
              color="var(--violet)" icon="↕" label="Autoescala"
              title="Ajusta cada eje Y al rango de sus propios datos" />
          </div>

          {/* Derecha: filtro de fechas + botón PNG (ícono cámara) */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* Selector de fechas del gráfico */}
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>Desde</span>
              <input type="date" value={chartDesde} onChange={e => setChartDesde(e.target.value)}
                style={INPUT_DATE} />
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>Hasta</span>
              <input type="date" value={chartHasta} onChange={e => setChartHasta(e.target.value)}
                style={INPUT_DATE} />
              {(chartDesde || chartHasta) && (
                <button onClick={() => { setChartDesde(''); setChartHasta('') }}
                  title="Restablecer fechas"
                  style={{ background:'none', border:'none', cursor:'pointer',
                           color:'var(--text-muted)', fontSize:14, padding:'0 2px' }}>✕</button>
              )}
            </div>

            {/* Botón cámara — exportar PNG */}
            <button onClick={dlPng}
              title="Exportar PNG — captura exacta de lo visible (estilo editorial, fondo crema)"
              style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                width:34, height:30, borderRadius:8, cursor:'pointer',
                background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
                color:'var(--text-secondary)', transition:'all 0.15s', flexShrink:0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--teal)'; e.currentTarget.style.color='var(--teal)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-subtle)'; e.currentTarget.style.color='var(--text-secondary)' }}>
              <CameraIcon />
            </button>
          </div>
        </div>

        {/* Gráfico */}
        <div style={{
          flex: aspOpt.ratio ? '0 0 auto' : 1,
          display:'flex', alignItems:'center', justifyContent:'center',
          minHeight:0,
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
        width:230, flexShrink:0, display:'flex', flexDirection:'column', gap:12,
        padding:'12px 14px', borderRadius:10, overflowY:'auto',
        background:'var(--ink-900)', border:'1px solid var(--border)',
        alignSelf:'flex-start',
      }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)',
                      letterSpacing:'.06em', borderBottom:'1px solid var(--border)',
                      paddingBottom:8 }}>
          Series del gráfico
        </div>

        {/* Serie 1 */}
        <SerieBlock s={s1} setS={setS1} ct={ct1} setCt={setCt1} ma={ma1} setMa={setMa1}
          idx={0} label="Serie 1" palette={palette} cols={cols}
          ajuste={ajusteS1} setAjuste={setAjusteS1} canAjust={canAjust} s3={s3} />
        <DIV />
        <SerieBlock s={s2} setS={setS2} ct={ct2} setCt={setCt2} ma={ma2} setMa={setMa2}
          idx={1} label="Serie 2 (opcional)" palette={palette} cols={cols}
          ajuste={ajusteS2} setAjuste={setAjusteS2} canAjust={canAjust} s3={s3} includeNone />
        <DIV />

        {/* Serie 3 */}
        <div style={{ fontSize:11, fontWeight:600, color: palette[2], letterSpacing:'.04em' }}>
          Serie 3 <span style={{ fontWeight:400, opacity:.6 }}>(opcional / divisor)</span>
        </div>
        <SelectS value={s3} onChange={setS3} includeNone />
        {s3 && (
          <>
            <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
              {CHART_TYPES.map(([v,l]) => <Btn key={v} active={ct3===v} onClick={()=>setCt3(v)} color={palette[2]}>{l}</Btn>)}
            </div>
            <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
              {MA_OPTS.map(([v,l]) => <Btn key={v} active={ma3===v} onClick={()=>setMa3(v)} color={palette[2]}>{l}</Btn>)}
            </div>
            {(ajusteS1 || ajusteS2) && (
              <div style={{
                padding:'7px 10px', borderRadius:8, fontSize:11, lineHeight:1.5,
                background: isDark ? '#1a0f00' : '#fff8e8',
                border:`1px solid ${palette[2]}40`, color: palette[2],
              }}>
                ÷ Divisor de: {[ajusteS1 && 'Serie 1', ajusteS2 && 'Serie 2'].filter(Boolean).join(' y ')}
                {ajusteS1 && ajusteS2 && ' — no se grafica por separado'}
              </div>
            )}
          </>
        )}

        <DIV />

        {autoScale && (
          <div style={{
            padding:'7px 10px', borderRadius:8, fontSize:11, lineHeight:1.5,
            background: isDark ? '#120a1f' : '#f5f0ff',
            border:`1px solid ${'var(--violet)'}40`, color:'var(--violet)',
          }}>↕ Autoescala activa por eje.</div>
        )}

        <div style={{
          padding:'8px 10px', borderRadius:8, fontSize:11, lineHeight:1.5,
          background: isDark ? '#0f1a12' : '#f0ece0',
          border:`1px solid ${isDark?'#1a3a20':'#c8b890'}`,
          color:'var(--text-muted)',
        }}>
          📷 El PNG exportado captura exactamente lo que ves: series visibles, fechas filtradas y estilo editorial.
        </div>
      </div>
    </div>
  )
}

// ── Bloque de configuración de una serie ─────────────────────────────────────
function SerieBlock({ s, setS, ct, setCt, ma, setMa, idx, label, palette, cols,
                      ajuste, setAjuste, canAjust, s3, includeNone }) {
  return (
    <>
      <div style={{ fontSize:11, fontWeight:600, color: palette[idx % palette.length], letterSpacing:'.04em' }}>
        {label}
      </div>
      <select value={s} onChange={e => setS(e.target.value)} style={{
        background:'var(--ink-800)', border:'1px solid var(--border-subtle)',
        color:'var(--text-primary)', borderRadius:8,
        padding:'5px 28px 5px 8px', fontSize:12, width:'100%',
      }}>
        {includeNone && <option value="">— Ninguna —</option>}
        {!includeNone && <option value="">—</option>}
        {cols.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
      </select>
      <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
        {CHART_TYPES.map(([v,l]) => (
          <button key={v} onClick={() => setCt(v)} style={{
            padding:'3px 8px', borderRadius:7, fontSize:11, fontWeight:500, cursor:'pointer',
            background: ct===v ? palette[idx % palette.length]+'22' : 'var(--ink-800)',
            color: ct===v ? palette[idx % palette.length] : 'var(--text-muted)',
            border: ct===v ? `1px solid ${palette[idx % palette.length]}55` : '1px solid var(--border-subtle)',
            transition:'all 0.1s',
          }}>{l}</button>
        ))}
      </div>
      <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
        {MA_OPTS.map(([v,l]) => (
          <button key={v} onClick={() => setMa(v)} style={{
            padding:'3px 8px', borderRadius:7, fontSize:11, fontWeight:500, cursor:'pointer',
            background: ma===v ? palette[idx % palette.length]+'22' : 'var(--ink-800)',
            color: ma===v ? palette[idx % palette.length] : 'var(--text-muted)',
            border: ma===v ? `1px solid ${palette[idx % palette.length]}55` : '1px solid var(--border-subtle)',
            transition:'all 0.1s',
          }}>{l}</button>
        ))}
      </div>
      {canAjust && (
        <button onClick={() => setAjuste(v => !v)}
          title={`Divide cada valor de ${label} por el valor de "${s3}" en el mismo período`}
          style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'4px 9px', borderRadius:7, fontSize:11, fontWeight:500, cursor:'pointer',
            background: ajuste ? palette[idx % palette.length]+'20' : 'var(--ink-800)',
            color: ajuste ? palette[idx % palette.length] : 'var(--text-muted)',
            border: ajuste ? `1px solid ${palette[idx % palette.length]}55` : '1px solid var(--border-subtle)',
            transition:'all 0.12s',
          }}>
          <span style={{ fontSize:13 }}>÷</span>
          {ajuste ? `Ajustado por "${s3}"` : `Ajustar por "${s3}"`}
        </button>
      )}
    </>
  )
}

// ── Ícono cámara fotográfica ──────────────────────────────────────────────────
const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)
