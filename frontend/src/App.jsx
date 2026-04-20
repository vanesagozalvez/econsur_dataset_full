import { useState } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import BuilderPanel from './components/BuilderPanel'
import DatasetTab   from './components/DatasetTab'

const MAX = 5

export default function App() {
  const [datasets, setDatasets] = useLocalStorage('econsur_v2', [])
  const [active,   setActive]   = useState('builder')
  const [notif,    setNotif]    = useState(null)

  const notify = (msg, type = 'ok') => {
    setNotif({ msg, type })
    setTimeout(() => setNotif(null), 3500)
  }

  const save = (ds) => {
    if (datasets.length >= MAX)                            { notify(`Límite de ${MAX} datasets alcanzado.`, 'err'); return false }
    if (datasets.find(d => d.nombre === ds.nombre))        { notify(`Ya existe un dataset "${ds.nombre}".`, 'err'); return false }
    setDatasets(p => [...p, ds])
    setActive(ds.nombre)
    notify(`Dataset "${ds.nombre}" guardado.`)
    return true
  }

  const del = (nombre) => {
    setDatasets(p => p.filter(d => d.nombre !== nombre))
    if (active === nombre) setActive('builder')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ink-950)' }}>

      {/* ── Header ── */}
      <header style={{ borderBottom:'1px solid #1a1a24', background:'var(--ink-950)' }}
              className="px-5 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
               style={{ background:'linear-gradient(135deg,#e8a820,#38d9c0)', color:'#000' }}>E</div>
          <span className="font-display text-lg text-white">
            Econ<span style={{ color:'var(--gold)' }}>Sur</span>
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                style={{ background:'var(--ink-800)', color:'#55556a', border:'1px solid var(--ink-700)' }}>
            Dataset Studio
          </span>
        </div>
        <span className="text-xs font-mono" style={{ color:'#44446a' }}>
          {datasets.length}/{MAX} datasets
        </span>
      </header>

      {/* ── Tab bar ── */}
      <nav style={{ background:'var(--ink-900)', borderBottom:'1px solid #1a1a24', minHeight:42 }}
           className="px-4 flex items-center gap-1 overflow-x-auto flex-shrink-0">

        {/* Builder tab */}
        <TabButton
          active={active === 'builder'}
          onClick={() => setActive('builder')}
          color="var(--gold)"
          icon={<PlusIcon />}
          label="Nuevo Dataset"
        />

        {datasets.length > 0 && <div className="w-px h-4 mx-1" style={{ background:'var(--ink-700)' }} />}

        {datasets.map(ds => (
          <TabButton
            key={ds.nombre}
            active={active === ds.nombre}
            onClick={() => setActive(ds.nombre)}
            color="var(--teal)"
            icon={<GridIcon />}
            label={ds.nombre}
            onClose={() => del(ds.nombre)}
          />
        ))}
      </nav>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-hidden">
        {active === 'builder' && (
          <BuilderPanel onSave={save} savedCount={datasets.length} max={MAX} />
        )}
        {datasets.map(ds =>
          active === ds.nombre && <DatasetTab key={ds.nombre} dataset={ds} />
        )}
      </main>

      {/* ── Toast ── */}
      {notif && (
        <div className="fixed bottom-5 right-5 px-4 py-2.5 rounded-xl text-sm font-medium z-50 fade-up"
             style={{
               background: notif.type === 'err' ? '#1f0a0a' : '#0a1f14',
               border: `1px solid ${notif.type === 'err' ? 'var(--coral)' : 'var(--teal)'}`,
               color:   notif.type === 'err' ? 'var(--coral)' : 'var(--teal)',
             }}>
          {notif.msg}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, color, icon, label, onClose }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-t whitespace-nowrap transition-all group"
      style={active
        ? { color, borderBottom: `2px solid ${color}`, background:'var(--ink-800)', fontWeight:500 }
        : { color:'#44446a', borderBottom:'2px solid transparent' }}
    >
      <span className="w-3 h-3">{icon}</span>
      {label}
      {onClose && (
        <span
          onClick={e => { e.stopPropagation(); onClose() }}
          className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color:'#44446a', lineHeight:1 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--coral)'}
          onMouseLeave={e => e.currentTarget.style.color = '#44446a'}
        >×</span>
      )}
    </button>
  )
}

const PlusIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
  </svg>
)
const GridIcon = () => (
  <svg fill="currentColor" viewBox="0 0 20 20" className="w-3 h-3">
    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
  </svg>
)
