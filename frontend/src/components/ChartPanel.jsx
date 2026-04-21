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

// Colores para modo oscuro/claro en pantalla
const COLORS_DARK  = ['#e8a820','#20c4ab','#9b7ef8','#e85454','#30b8d8','#d47820']
const COLORS_LIGHT = ['#b86800','#0a8a78','#5c3cc0','#c02020','#1480a0','#a04c00']
// Colores para exportación (siempre sobre fondo blanco — profesionales, alta legibilidad)
const COLORS_EXPORT = ['#1a5fa8','#b84800','#2a7a30','#8b0088','#7a4000','#005f60']

const ASPECT_OPTS = [
  { key:'web',      label:'Web',      icon:'⬛', ratio:null,  w:1400, h:700  },
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

  // ── Construir trazas con colores según modo ──────────────────────────────
  const buildTraces = useCallback((forExport = false) => {
    const traces  = []
    const xs      = data.map(d => d.periodo)
    const isDark  = document.documentElement.getAttribute('data-theme') !== 'light'
    const palette = forExport ? COLORS_EXPORT : (isDark ? COLORS_DARK : COLORS_LIGHT)

    const addTrace = (lbl, ct, ma, ci, yaxis) => {
      if (!lbl) return
      const ys    = data.map(d => d[lbl])
      const color = palette[ci % palette.length]
      if (ct === 'bar') {
        traces.push({ x:xs, y:ys, name:lbl, yaxis, type:'bar',
          marker:{ color: forExport ? color+'bb' : color+'99',
                   line:{ color, width: forExport ? 1.5 : 1 } } })
      } else {
        traces.push({ x:xs, y:ys, name:lbl, yaxis, type:'scatter', mode:'lines',
          line:{ color, width: forExport ? 2 : 2.5 },
          ...(ct==='scatter-area' ? { fill:'tozeroy',
            fillcolor: forExport ? color+'25' : color+'15' } : {}) })
      }
      if (ma > 0) {
        traces.push({ x:xs, y:sma(ys, ma), name:`${lbl} MM${ma}`, yaxis,
          type:'scatter', mode:'lines',
          line:{ color, width: forExport ? 1.5 : 1.5, dash:'dot' }, opacity:0.85 })
      }
    }
    addTrace(s1, ct1, ma1, 0, 'y')
    addTrace(s2, ct2, ma2, 1, s2 && s2!==s1 ? 'y2' : 'y')
    addTrace(s3, ct3, ma3, 2, s3 && s3!==s1 && s3!==s2 ? 'y2' : 'y')
    return traces
  }, [data, s1, s2, s3, ct1, ct2, ct3, ma1, ma2, ma3])

  // ── Layout interactivo (sin grilla, ejes limpios) ────────────────────────
  const buildLayout = useCallback((forExport = false) => {
    const isDark   = document.documentElement.getAttribute('data-theme') !== 'light'
    const hasDual  = (s2 && s2!==s1) || (s3 && s3!==s1 && s3!==s2)
    const palette  = forExport ? COLORS_EXPORT : (isDark ? COLORS_DARK : COLORS_LIGHT)

    if (forExport) {
      // ── Layout de exportación: fondo blanco, grilla sutil, tipografía oscura ──
      const axisExport = {
        showgrid:    true,
        gridcolor:   '#e8e8e8',
        gridwidth:   0.5,
        showline:    true,
        linecolor:   '#555555',
        linewidth:   1.5,
        tickfont:    { size:11, color:'#333333', family:'Arial,sans-serif' },
        tickcolor:   '#555555',
        zeroline:    false,
        mirror:      false,
      }
      return {
        paper_bgcolor: '#ffffff',
        plot_bgcolor:  '#ffffff',
        font:{ family:'Arial,sans-serif', color:'#222222', size:12 },
        margin:{ t:32, r: hasDual ? 70 : 24, b:56, l:70 },
        xaxis: { ...axisExport },
        yaxis: { ...axisExport },
        ...(hasDual ? { yaxis2:{
          overlaying:'y', side:'right', showgrid:false,
          showline:true, linecolor:'#555555', linewidth:1.5,
          tickfont:{ size:11, color: palette[1], family:'Arial,sans-serif' },
          tickcolor: palette[1], zeroline:false,
        }} : {}),
        legend:{
          x:0, y:-0.2, orientation:'h', bgcolor:'transparent',
          font:{ size:11, color:'#333333', family:'Arial,sans-serif' },
          bordercolor:'#cccccc', borderwidth:0.5,
        },
        hovermode:'x unified',
      }
    }

    // ── Layout interactivo: sin grilla, ejes limpios ──────────────────────
    const axisWeb = {
      showgrid:   false,            // ← SIN grilla
      showline:   true,
      linecolor:  isDark ? '#44446a' : '#888898',
      linewidth:  2,
      tickfont:{
        size:10,
        color: isDark ? '#88889a' : '#6a6a8a',
        family:'DM Sans,sans-serif',
      },
      tickcolor:  isDark ? '#44446a' : '#888898',
      zeroline:   false,
      mirror:     false,
    }
    return {
      paper_bgcolor: 'transparent',
      plot_bgcolor:  'transparent',
      font:{ family:'DM Sans,sans-serif', color: isDark ? '#88889a' : '#6a6a8a', size:11 },
      margin:{ t:16, r: hasDual ? 60 : 16, b:48, l:60 },
      xaxis: { ...axisWeb },
      yaxis: { ...axisWeb },
      ...(hasDual ? { yaxis2:{
        overlaying:'y', side:'right', showgrid:false,
        showline:true, linecolor: isDark ? '#44446a' : '#888898', linewidth:2,
        tickfont:{ size:10, color: palette[1] },
        tickcolor: palette[1], zeroline:false,
      }} : {}),
      legend:{
        x:0, y:-0.18, orientation:'h', bgcolor:'transparent',
        font:{ size:10, color: isDark ? '#88889a' : '#6a6a8a' },
      },
      hovermode:'x unified',
      hoverlabel:{
        bgcolor:     isDark ? '#1a1a2e' : '#ffffff',
        bordercolor: isDark ? '#44446a' : '#cccccc',
        font:{ family:'DM Sans', size:12, color: isDark ? '#e8e8f0' : '#1a1a2e' },
      },
    }
  }, [s1, s2, s3])

  // ── Renderizar gráfico interactivo ───────────────────────────────────────
  useEffect(() => {
    if (!ready || !ref.current || !data.length) return
    const traces = buildTraces(false)
    const layout = buildLayout(false)
    const aspOpt = ASPECT_OPTS.find(a => a.key === aspect)
    const config = {
      responsive:true, displaylogo:false,
      modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'],
      toImageButtonOptions:{
        format:'png', filename:`econsur_${dataset.nombre}`,
        height: aspOpt.h, width: aspOpt.w, scale:2,
      },
    }
    if (plotted.current) Plotly.react(ref.current, traces, layout, config)
    else { Plotly.newPlot(ref.current, traces, layout, config); plotted.current = true }
  }, [ready, buildTraces, buildLayout, aspect, dataset])

  // ── Exportar PNG con fondo blanco siempre ────────────────────────────────
  const dlPng = async () => {
    if (!ref.current) return
    await loadPlotly()
    const aspOpt   = ASPECT_OPTS.find(a => a.key === aspect)
    const traces   = buildTraces(true)   // colores para impresión
    const layout   = buildLayout(true)   // fondo blanco, grilla sutil

    // Crear gráfico temporal off-screen y exportar
    const tmpDiv = document.createElement('div')
    tmpDiv.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${aspOpt.w}px;height:${aspOpt.h}px;`
    document.body.appendChild(tmpDiv)
    try {
      await Plotly.newPlot(tmpDiv, traces, layout, { staticPlot:true, responsive:false })
      await Plotly.downloadImage(tmpDiv, {
        format:'png',
        filename:`econsur_${dataset.nombre}_${aspect}`,
        height: aspOpt.h,
        width:  aspOpt.w,
        scale:  2,
      })
    } finally {
      Plotly.purge(tmpDiv)
      document.body.removeChild(tmpDiv)
    }
  }

  const aspOpt = ASPECT_OPTS.find(a => a.key === aspect)
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  const palette = isDark ? COLORS_DARK : COLORS_LIGHT

  const SelectSerie = ({ value, onChange, includeNone }) => (
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

  const SerieCtrl = ({ s, setS, ct, setCt, ma, setMa, idx, label }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.04em',
                    color: palette[idx % palette.length] }}>
        {label}
      </div>
      <SelectSerie value={s} onChange={setS} includeNone={idx > 0} />
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

      {/* ── GRÁFICO ── */}
      <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0, gap:10, minHeight:0 }}>

        {/* Barra superior: proporciones + exportar */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'7px 12px', borderRadius:8, flexShrink:0,
          background:'var(--ink-900)', border:'1px solid var(--border)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', marginRight:4 }}>Proporción:</span>
            {ASPECT_OPTS.map(a => (
              <Btn key={a.key} active={aspect===a.key} onClick={() => setAspect(a.key)} color="var(--teal)">
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
          title="Exporta siempre con fondo blanco, ideal para documentos e informes"
          onMouseEnter={e => e.currentTarget.style.borderColor='var(--teal)'}
          onMouseLeave={e => e.currentTarget.style.borderColor='var(--border-subtle)'}>
            <PngIcon /> Exportar PNG
            <span style={{ fontSize:10, opacity:.6, marginLeft:2 }}>(fondo blanco)</span>
          </button>
        </div>

        {/* Área del gráfico */}
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

      {/* ── PANEL LATERAL ── */}
      <div style={{
        width:220, flexShrink:0, display:'flex', flexDirection:'column', gap:12,
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
        <div style={{ height:1, background:'var(--border)' }}/>
        <SerieCtrl s={s2} setS={setS2} ct={ct2} setCt={setCt2} ma={ma2} setMa={setMa2}
                   idx={1} label="Serie 2 (opcional)" />
        <div style={{ height:1, background:'var(--border)' }}/>
        <SerieCtrl s={s3} setS={setS3} ct={ct3} setCt={setCt3} ma={ma3} setMa={setMa3}
                   idx={2} label="Serie 3 (opcional)" />

        {/* Nota sobre exportación */}
        <div style={{
          marginTop:4, padding:'8px 10px', borderRadius:8, fontSize:11,
          background: isDark ? '#0a1a0a' : '#f0faf5',
          border:'1px solid var(--teal)28', color:'var(--text-muted)',
          lineHeight:1.5,
        }}>
          💡 El PNG exportado siempre usa <strong>fondo blanco</strong> con colores optimizados para impresión.
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

