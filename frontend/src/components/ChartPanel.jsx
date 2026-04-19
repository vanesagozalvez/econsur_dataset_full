import { useState, useEffect, useRef, useCallback } from 'react'

// Dynamically import Plotly to avoid SSR issues
let Plotly = null
const loadPlotly = async () => {
  if (!Plotly) {
    Plotly = (await import('plotly.js-dist-min')).default
  }
  return Plotly
}

// Compute simple moving average
function sma(values, window) {
  return values.map((_, i) => {
    if (i < window - 1) return null
    const slice = values.slice(i - window + 1, i + 1)
    const valid = slice.filter(v => v !== null && v !== undefined)
    return valid.length === window ? valid.reduce((a, b) => a + b, 0) / window : null
  })
}

const CHART_TYPES = [
  { value: 'scatter', label: 'Línea' },
  { value: 'bar', label: 'Barras' },
  { value: 'scatter-area', label: 'Área' },
]

const MA_OPTIONS = [
  { value: 0, label: 'Sin MM' },
  { value: 3, label: 'MM3' },
  { value: 4, label: 'MM4' },
  { value: 12, label: 'MM12' },
]

const SERIES_COLORS = [
  '#e8a820', '#38d9c0', '#a78bfa', '#ff7c7c',
  '#60d4f0', '#f0a060', '#80d48c', '#f080c0',
]

export default function ChartPanel({ dataset }) {
  const containerRef = useRef(null)
  const plotRef = useRef(null)

  const columns = dataset?.result?.columnas || []
  const data = dataset?.result?.data || []

  const [s1, setS1] = useState(columns[0]?.label || '')
  const [s2, setS2] = useState('')
  const [chartType1, setChartType1] = useState('scatter')
  const [chartType2, setChartType2] = useState('scatter')
  const [ma1, setMa1] = useState(0)
  const [ma2, setMa2] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadPlotly().then(() => setReady(true))
  }, [])

  useEffect(() => {
    if (columns.length > 0) setS1(columns[0]?.label || '')
  }, [dataset])

  const buildTraces = useCallback(() => {
    const traces = []
    const xValues = data.map(d => d.periodo)

    const addSeries = (label, chartType, maWindow, colorIdx, yaxis) => {
      if (!label) return
      const yValues = data.map(d => d[label])
      const color = SERIES_COLORS[colorIdx % SERIES_COLORS.length]
      const isArea = chartType === 'scatter-area'

      const trace = {
        x: xValues,
        y: yValues,
        name: label,
        yaxis,
        line: { color, width: 2 },
        marker: { color },
      }

      if (chartType === 'bar') {
        trace.type = 'bar'
        trace.marker = { color: color + '99', line: { color, width: 1 } }
      } else {
        trace.type = 'scatter'
        trace.mode = 'lines'
        if (isArea) {
          trace.fill = yaxis === 'y' ? 'tozeroy' : 'tozeroy'
          trace.fillcolor = color + '22'
        }
      }
      traces.push(trace)

      // Moving average overlay
      if (maWindow > 0) {
        const maValues = sma(yValues, maWindow)
        traces.push({
          x: xValues,
          y: maValues,
          name: `${label} MM${maWindow}`,
          yaxis,
          type: 'scatter',
          mode: 'lines',
          line: { color, width: 1.5, dash: 'dot' },
          opacity: 0.85,
        })
      }
    }

    addSeries(s1, chartType1, ma1, 0, 'y')
    addSeries(s2, chartType2, ma2, 1, s2 && s2 !== s1 ? 'y2' : 'y')

    return traces
  }, [data, s1, s2, chartType1, chartType2, ma1, ma2])

  useEffect(() => {
    if (!ready || !containerRef.current || !data.length) return

    const traces = buildTraces()
    const hasDualAxis = s2 && s2 !== s1

    const layout = {
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'DM Sans, sans-serif', color: '#88889a', size: 11 },
      margin: { t: 20, r: hasDualAxis ? 60 : 20, b: 50, l: 60 },
      xaxis: {
        gridcolor: '#1a1a24',
        tickcolor: '#32324e',
        linecolor: '#32324e',
        tickfont: { size: 10 },
        showgrid: true,
      },
      yaxis: {
        gridcolor: '#1a1a24',
        tickcolor: '#32324e',
        linecolor: '#32324e',
        tickfont: { size: 10 },
        showgrid: true,
        zeroline: false,
      },
      yaxis2: hasDualAxis ? {
        overlaying: 'y',
        side: 'right',
        gridcolor: 'transparent',
        tickcolor: '#32324e',
        tickfont: { size: 10, color: SERIES_COLORS[1] },
        zeroline: false,
        showgrid: false,
      } : undefined,
      legend: {
        x: 0, y: -0.15,
        orientation: 'h',
        bgcolor: 'transparent',
        font: { size: 10, color: '#88889a' },
      },
      hovermode: 'x unified',
      hoverlabel: {
        bgcolor: '#1a1a24',
        bordercolor: '#32324e',
        font: { family: 'DM Sans', size: 12, color: '#e8e8f0' },
      },
    }

    const config = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: `econsur_${dataset.nombre}`,
        height: 600,
        width: 1200,
        scale: 2,
      },
    }

    if (plotRef.current) {
      Plotly.react(containerRef.current, traces, layout, config)
    } else {
      Plotly.newPlot(containerRef.current, traces, layout, config)
      plotRef.current = true
    }
  }, [ready, buildTraces, s1, s2, dataset])

  const handleDownloadPng = async () => {
    if (!containerRef.current) return
    await loadPlotly()
    Plotly.downloadImage(containerRef.current, {
      format: 'png',
      filename: `econsur_${dataset.nombre}`,
      height: 600,
      width: 1200,
      scale: 2,
    })
  }

  const controlClass = "rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer"

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-start">
        {/* Series 1 */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium" style={{ color: '#e8a820' }}>Serie 1</p>
          <div className="flex items-center gap-2">
            <select
              value={s1}
              onChange={e => setS1(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs"
              style={{ background: '#1a1a24', border: '1px solid #32324e', color: '#e8e8f0' }}
            >
              <option value="">—</option>
              {columns.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>
            <div className="flex gap-1">
              {CHART_TYPES.map(ct => (
                <button key={ct.value} onClick={() => setChartType1(ct.value)}
                  className={controlClass}
                  style={chartType1 === ct.value
                    ? { background: '#e8a820', color: '#0a0a0f' }
                    : { background: '#1a1a24', color: '#55556a', border: '1px solid #24243a' }}>
                  {ct.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {MA_OPTIONS.map(m => (
                <button key={m.value} onClick={() => setMa1(m.value)}
                  className={controlClass}
                  style={ma1 === m.value
                    ? { background: '#24243a', color: '#e8a820', border: '1px solid #e8a820' }
                    : { background: '#1a1a24', color: '#55556a', border: '1px solid #24243a' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Series 2 */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium" style={{ color: '#38d9c0' }}>Serie 2 (opcional)</p>
          <div className="flex items-center gap-2">
            <select
              value={s2}
              onChange={e => setS2(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs"
              style={{ background: '#1a1a24', border: '1px solid #32324e', color: '#e8e8f0' }}
            >
              <option value="">— Ninguna —</option>
              {columns.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>
            {s2 && (
              <>
                <div className="flex gap-1">
                  {CHART_TYPES.map(ct => (
                    <button key={ct.value} onClick={() => setChartType2(ct.value)}
                      className={controlClass}
                      style={chartType2 === ct.value
                        ? { background: '#38d9c0', color: '#0a0a0f' }
                        : { background: '#1a1a24', color: '#55556a', border: '1px solid #24243a' }}>
                      {ct.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {MA_OPTIONS.map(m => (
                    <button key={m.value} onClick={() => setMa2(m.value)}
                      className={controlClass}
                      style={ma2 === m.value
                        ? { background: '#24243a', color: '#38d9c0', border: '1px solid #38d9c0' }
                        : { background: '#1a1a24', color: '#55556a', border: '1px solid #24243a' }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="ml-auto">
          <button
            onClick={handleDownloadPng}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all"
            style={{ background: '#1a1a24', border: '1px solid #32324e', color: '#88889a' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#38d9c0'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#32324e'}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            PNG
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 rounded-xl overflow-hidden" style={{ minHeight: '380px', background: '#0e0e16', border: '1px solid #1a1a24' }}>
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center" style={{ color: '#32324e' }}>
            <p className="text-sm">Sin datos disponibles</p>
          </div>
        ) : (
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        )}
      </div>
    </div>
  )
}
