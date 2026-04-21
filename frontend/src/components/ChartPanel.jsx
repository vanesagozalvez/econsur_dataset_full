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

// Divide dos arrays valor a valor. Si divisor es 0 o null → null
function divideArrays(numerador, divisor) {
  return numerador.map((v, i) => {
    const d = divisor[i]
    if (v == null || d == null || d === 0) return null
    return v / d
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

/* ── Botón genérico ── */
const Btn = ({ active, onClick, color, children, title }) => (
  <button onClick={onClick} title={title} style={{
    padding:'3px 8px', borderRadius:7, fontSize:11, fontWeight:500, cursor:'pointer',
    background: active ? color+'22' : 'var(--ink-800)',
    color: active ? color : 'var(--text-muted)',
    border: active ? `1px solid ${color}55` : '1px solid var(--border-subtle)',
    transition:'all 0.1s', whiteSpace:'nowrap',
  }}>{children}</button>
)

/* ── Toggle pequeño con ícono ── */
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

/* ── Layout editorial (igual en pantalla y exportación) ── */
function buildEditorialLayout({ forExport, isDark, hasDual, palette, nombre, desde, hasta, autoRange1, autoRange2, yRange1, yRange2 }) {
  const bg       = forExport || !isDark ? CREAM      : 'transparent'
  const paperBg  = forExport || !isDark ? CREAM      : 'transparent'
  const axisLine = forExport || !isDark ? '#888070'  : '#44446a'
  const tickCol  = forExport || !isDark ? '#6a6050'  : '#88889a'
  const gridCol  = forExport || !isDark ? CREAM_GRID : '#1a1a28'
  const fontFam  = 'Arial,Helvetica,sans-serif'
  const fs       = forExport ? 12 : 10

  const baseAxis = {
    showgrid: true, gridcolor: gridCol, gridwidth: forExport ? 0.8 : 0.5,
    showline: false, zeroline: true,
    zerolinecolor: forExport || !isDark ? '#aaa090' : '#2a2a40',
    zerolinewidth: forExport ? 1 : 0.5,
    tickfont: { family: fontFam, size: fs, color: tickCol },
    tickcolor: axisLine, ticks: 'outside', ticklen: 4, tickwidth: 1,
  }
  const xAxisBase = {
    showgrid: false, showline: true,
    linecolor: axisLine, linewidth: forExport ? 1.5 : 1,
    mirror: false, zeroline: false,
    tickfont: { family: fontFam, size: fs, color: tickCol },
    tickcolor: axisLine, ticks: 'outside', ticklen: 4, tickwidth: 1,
  }

  return {
    paper_bgcolor: paperBg, plot_bgcolor: bg,
    font: { family: fontFam, color: tickCol, size: fs },
    margin: { t: forExport ? 90 : 16, r: hasDual ? 70 : (forExport ? 30 : 16), b: forExport ? 72 : 52, l: forExport ? 72 : 60 },
    xaxis: { ...xAxisBase },
    yaxis: {
      ...baseAxis,
      autorange: autoRange1,
      ...((!autoRange1 && yRange1) ? { range: yRange1 } : {}),
    },
    ...(hasDual ? { yaxis2: {
      ...baseAxis,
      overlaying: 'y', side: 'right', showgrid: false,
      tickfont: { family: fontFam, size: fs, color: palette[1] },
      tickcolor: palette[1],
      autorange: autoRange2,
      ...((!autoRange2 && yRange2) ? { range: yRange2 } : {}),
    }} : {}),
    legend: {
      x: 0, y: forExport ? -0.14 : -0.18, orientation: 'h',
      bgcolor: 'transparent',
      font: { family: fontFam, size: forExport ? 12 : 10, color: tickCol },
    },
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor:     forExport || !isDark ? '#ffffff' : '#1a1a2e',
      bordercolor: forExport || !isDark ? '#ccbbaa' : '#44446a',
      font: { family: fontFam, size: 12, color: forExport || !isDark ? '#1a1a1a' : '#e8e8f0' },
    },
    ...(forExport ? {
      annotations: [
        { xref:'paper', yref:'paper', x:0, y:1.0, xanchor:'left', yanchor:'bottom',
          text:'<b>ECONSUR · DATASET STUDIO</b>',
          font:{ family: fontFam, size:13, color:'#3a3020' }, showarrow:false },
        { xref:'paper', yref:'paper', x:0, y:0.945, xanchor:'left', yanchor:'bottom',
          text:`${nombre?.toUpperCase()}  (${desde?.slice(0,4)||''}–${hasta?.slice(0,4)||''})`,
          font:{ family: fontFam, size:11, color:'#6a6050' }, showarrow:false },
        { xref:'paper', yref:'paper', x:1, y:1.0, xanchor:'right', yanchor:'bottom',
          text:'ECONSUR RESEARCH',
          font:{ family: fontFam, size:10, color:'#9a8a70' }, showarrow:false },
      ],
      shapes: [{
        type:'line', xref:'paper', yref:'paper',
        x0:0, x1:1, y0:0.93, y1:0.93,
        line:{ color:'#8a7a60', width:1.5 },
      }],
    } : {}),
  }
}

/* ── Construye trazas aplicando ajuste por Serie 3 si corresponde ── */
function buildTraces({ data, s1, s2, s3, ct1, ct2, ct3, ma1, ma2, ma3,
                       ajusteS1, ajusteS2, palette, forExport }) {
  const traces = []
  const xs     = data.map(d => d.periodo)
  const ys3Raw = s3 ? data.map(d => d[s3]) : null

  const getValues = (label, ajustar) => {
    const raw = data.map(d => d[label])
    if (ajustar && ys3Raw && s3) return divideArrays(raw, ys3Raw)
    return raw
  }

  const addTrace = (lbl, ct, ma, ci, yaxis, ajustar) => {
    if (!lbl) return
    const ys    = getValues(lbl, ajustar)
    const color = palette[ci % palette.length]
    const lw    = forExport ? 2 : 2.5
    const nameLabel = ajustar && s3 ? `${lbl} ÷ ${s3}` : lbl

    if (ct === 'bar') {
      traces.push({ x:xs, y:ys, name:nameLabel, yaxis, type:'bar',
        marker:{ color: color+(forExport?'bb':'99'), line:{ color, width: forExport?1.5:1 } } })
    } else {
      traces.push({ x:xs, y:ys, name:nameLabel, yaxis, type:'scatter', mode:'lines',
        line:{ color, width:lw, shape:'linear' },
        ...(ct==='scatter-area' ? { fill:'tozeroy', fillcolor: color+'20' } : {}) })
    }
    if (ma > 0) {
      traces.push({ x:xs, y:sma(ys, ma), name:`${nameLabel} MM${ma}`, yaxis,
        type:'scatter', mode:'lines', line:{ color, width:1.5, dash:'dot' }, opacity:0.8 })
    }
  }

  // Serie 3 va siempre en eje Y derecho (es el divisor — puede mostrarse igual)
  const hasDual = (s2 && s2!==s1) || (s3 && !ajusteS1 && !ajusteS2)
  addTrace(s1, ct1, ma1, 0, 'y',  ajusteS1)
  addTrace(s2, ct2, ma2, 1, s2 && s2!==s1 ? 'y2' : 'y', ajusteS2)
  // Mostrar Serie 3 solo si NO se usa como divisor de ambas
  if (s3 && !(ajusteS1 && ajusteS2)) {
    const showS3onY2 = (s3 !== s1 && s3 !== s2)
    addTrace(s3, ct3, ma3, 2, showS3onY2 ? 'y2' : 'y', false)
  }
  return traces
}

/* ── Componente principal ── */
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

  // ── Nuevos estados ──
  const [autoScale, setAutoScale] = useState(false)  // autoescala independiente por eje
  const [ajusteS1,  setAjusteS1]  = useState(false)  // dividir Serie 1 por Serie 3
  const [ajusteS2,  setAjusteS2]  = useState(false)  // dividir Serie 2 por Serie 3

  useEffect(() => { loadPlotly().then(() => setReady(true)) }, [])
  useEffect(() => {
    if (cols.length) { setS1(cols[0]?.label||''); setS2(''); setS3('') }
    setAjusteS1(false); setAjusteS2(false)
  }, [dataset])

  // Desactivar ajuste si se quita Serie 3
  useEffect(() => {
    if (!s3) { setAjusteS1(false); setAjusteS2(false) }
  }, [s3])

  const getIsDark = () => document.documentElement.getAttribute('data-theme') !== 'light'

  // Calcula rango Y para autoescala independiente
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

  const renderChart = useCallback((forExport = false) => {
    const isDark   = getIsDark()
    const palette  = forExport ? PAL_EXPORT : (isDark ? PAL_DARK : PAL_LIGHT)
    const hasDual  = (s2 && s2!==s1) || (s3 && !(ajusteS1 && ajusteS2))
    const aspOpt   = ASPECT_OPTS.find(a => a.key === aspect)

    const traces   = buildTraces({ data, s1, s2, s3, ct1, ct2, ct3, ma1, ma2, ma3,
                                    ajusteS1, ajusteS2, palette, forExport })

    // Autoescala: calcular rangos independientes para cada eje
    let autoRange1 = true, autoRange2 = true
    let yRange1 = null, yRange2 = null
    if (autoScale && s1) {
      autoRange1 = false
      yRange1    = calcYRange(s1, ajusteS1)
    }
    if (autoScale && s2 && hasDual) {
      autoRange2 = false
      yRange2    = calcYRange(s2, ajusteS2)
    }

    const layout = buildEditorialLayout({
      forExport, isDark, hasDual, palette, aspOpt,
      nombre: dataset?.nombre||'', desde: dataset?.desde||'', hasta: dataset?.hasta||'',
      autoRange1, autoRange2, yRange1, yRange2,
    })
    return { traces, layout }
  }, [data, s1, s2, s3, ct1, ct2, ct3, ma1, ma2, ma3,
      ajusteS1, ajusteS2, autoScale, aspect, dataset, calcYRange])

  useEffect(() => {
    if (!ready || !ref.current || !data.length) return
    const { traces, layout } = renderChart(false)
    const aspOpt = ASPECT_OPTS.find(a => a.key === aspect)
    const config = {
      responsive:true, displaylogo:false,
      modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'],
      toImageButtonOptions:{ format:'png', filename:`econsur_${dataset.nombre}`,
        height:aspOpt.h, width:aspOpt.w, scale:2 },
    }
    if (plotted.current) Plotly.react(ref.current, traces, layout, config)
    else { Plotly.newPlot(ref.current, traces, layout, config); plotted.current = true }
  }, [ready, renderChart, aspect, dataset])

  const dlPng = async () => {
    if (!ref.current) return
    await loadPlotly()
    const aspOpt             = ASPECT_OPTS.find(a => a.key === aspect)
    const { traces, layout } = renderChart(true)
    const tmpDiv = document.createElement('div')
    tmpDiv.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${aspOpt.w}px;height:${aspOpt.h}px;`
    document.body.appendChild(tmpDiv)
    try {
      await Plotly.newPlot(tmpDiv, traces, layout, { staticPlot:true, responsive:false })
      await Plotly.downloadImage(tmpDiv, {
        format:'png', filename:`econsur_${dataset.nombre}_${aspect}`,
        height:aspOpt.h, width:aspOpt.w, scale:2,
      })
    } finally { Plotly.purge(tmpDiv); document.body.removeChild(tmpDiv) }
  }

  const isDark   = getIsDark()
  const palette  = isDark ? PAL_DARK : PAL_LIGHT
  const aspOpt   = ASPECT_OPTS.find(a => a.key === aspect)
  const canAjust = !!s3  // Solo disponible si hay Serie 3 seleccionada

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
          padding:'7px 12px', borderRadius:8, flexShrink:0,
          background:'var(--ink-900)', border:'1px solid var(--border)',
          flexWrap:'wrap', gap:6,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', marginRight:2 }}>Proporción:</span>
            {ASPECT_OPTS.map(a => (
              <Btn key={a.key} active={aspect===a.key} onClick={() => setAspect(a.key)} color="var(--teal)">
                {a.icon} {a.label}
              </Btn>
            ))}
            {/* Autoescala */}
            <div style={{ width:1, background:'var(--border)', height:18, margin:'0 4px' }}/>
            <Toggle
              active={autoScale}
              onClick={() => setAutoScale(v => !v)}
              color="var(--violet)"
              icon="↕"
              label="Autoescala"
              title="Ajusta cada eje Y al rango de sus propios datos — evita que una serie aplaste a la otra"
            />
          </div>
          <button onClick={dlPng}
            title="Exporta con fondo crema y estilo editorial"
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

        {/* ── SERIE 1 ── */}
        <div style={{ fontSize:11, fontWeight:600, color: palette[0], letterSpacing:'.04em' }}>Serie 1</div>
        <SelectS value={s1} onChange={setS1} />
        <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
          {CHART_TYPES.map(([v,l]) => <Btn key={v} active={ct1===v} onClick={()=>setCt1(v)} color={palette[0]}>{l}</Btn>)}
        </div>
        <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
          {MA_OPTS.map(([v,l]) => <Btn key={v} active={ma1===v} onClick={()=>setMa1(v)} color={palette[0]}>{l}</Btn>)}
        </div>
        {/* Ajuste S1 por S3 */}
        {canAjust && (
          <Toggle active={ajusteS1} onClick={() => setAjusteS1(v => !v)}
            color={palette[0]} icon="÷" label={`Ajustar por "${s3}"`}
            title={`Divide cada valor de Serie 1 por el valor de "${s3}" en el mismo período. Útil para deflactar o normalizar.`}
          />
        )}

        <DIV />

        {/* ── SERIE 2 ── */}
        <div style={{ fontSize:11, fontWeight:600, color: palette[1], letterSpacing:'.04em' }}>
          Serie 2 <span style={{ fontWeight:400, opacity:.6 }}>(opcional)</span>
        </div>
        <SelectS value={s2} onChange={setS2} includeNone />
        {s2 && <>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {CHART_TYPES.map(([v,l]) => <Btn key={v} active={ct2===v} onClick={()=>setCt2(v)} color={palette[1]}>{l}</Btn>)}
          </div>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {MA_OPTS.map(([v,l]) => <Btn key={v} active={ma2===v} onClick={()=>setMa2(v)} color={palette[1]}>{l}</Btn>)}
          </div>
          {canAjust && (
            <Toggle active={ajusteS2} onClick={() => setAjusteS2(v => !v)}
              color={palette[1]} icon="÷" label={`Ajustar por "${s3}"`}
              title={`Divide cada valor de Serie 2 por el valor de "${s3}" en el mismo período.`}
            />
          )}
        </>}

        <DIV />

        {/* ── SERIE 3 (divisor / tercera serie) ── */}
        <div style={{ fontSize:11, fontWeight:600, color: palette[2], letterSpacing:'.04em' }}>
          Serie 3 <span style={{ fontWeight:400, opacity:.6 }}>(opcional / divisor)</span>
        </div>
        <SelectS value={s3} onChange={setS3} includeNone />
        {s3 && <>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {CHART_TYPES.map(([v,l]) => <Btn key={v} active={ct3===v} onClick={()=>setCt3(v)} color={palette[2]}>{l}</Btn>)}
          </div>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {MA_OPTS.map(([v,l]) => <Btn key={v} active={ma3===v} onClick={()=>setMa3(v)} color={palette[2]}>{l}</Btn>)}
          </div>
          {/* Indicador de uso como divisor */}
          {(ajusteS1 || ajusteS2) && (
            <div style={{
              padding:'7px 10px', borderRadius:8, fontSize:11, lineHeight:1.5,
              background: isDark ? '#1a0f00' : '#fff8e8',
              border:`1px solid ${palette[2]}40`, color: palette[2],
            }}>
              ÷ Usada como divisor de:{' '}
              {[ajusteS1 && 'Serie 1', ajusteS2 && 'Serie 2'].filter(Boolean).join(' y ')}
              {ajusteS1 && ajusteS2 && ' — no se grafica por separado'}
            </div>
          )}
        </>}

        <DIV />

        {/* ── Info autoescala ── */}
        {autoScale && (
          <div style={{
            padding:'7px 10px', borderRadius:8, fontSize:11, lineHeight:1.5,
            background: isDark ? '#120a1f' : '#f5f0ff',
            border:`1px solid ${'var(--violet)'}40`, color:'var(--violet)',
          }}>
            ↕ Autoescala activa: cada eje Y muestra el rango óptimo para sus series.
          </div>
        )}

        <div style={{
          padding:'8px 10px', borderRadius:8, fontSize:11, lineHeight:1.5,
          background: isDark ? '#0f1a12' : '#f0ece0',
          border:`1px solid ${isDark?'#1a3a20':'#c8b890'}`,
          color:'var(--text-muted)',
        }}>
          📋 PNG: fondo crema + header editorial.
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
