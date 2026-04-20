import { useState } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import BuilderPanel from './components/BuilderPanel'
import DatasetTab   from './components/DatasetTab'

const MAX = 5

export default function App() {
  const [datasets, setDatasets] = useLocalStorage('econsur_v2', [])
  const [active,   setActive]   = useState('builder')
  const [notif,    setNotif]    = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  const notify = (msg, type = 'ok') => {
    setNotif({ msg, type })
    setTimeout(() => setNotif(null), 3500)
  }

  const save = (ds) => {
    if (datasets.length >= MAX)                     { notify(`Límite de ${MAX} datasets alcanzado.`, 'err'); return false }
    if (datasets.find(d => d.nombre === ds.nombre)) { notify(`Ya existe un dataset "${ds.nombre}".`, 'err'); return false }
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
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--ink-950)' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: collapsed ? 52 : 196,
        minWidth: collapsed ? 52 : 196,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ink-900)',
        borderRight: '1px solid var(--ink-800)',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{
          display:'flex', alignItems:'center', gap:10,
          padding: collapsed ? '14px 12px' : '14px 12px',
          borderBottom:'1px solid var(--ink-800)', flexShrink:0,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width:28, height:28, borderRadius:8, flexShrink:0,
            background:'linear-gradient(135deg,#e8a820,#38d9c0)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:'bold', fontSize:13, color:'#000',
          }}>E</div>
          {!collapsed && (
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontSize:15, color:'#fff', whiteSpace:'nowrap' }}>
                Econ<span style={{ color:'var(--gold)' }}>Sur</span>
              </div>
              <div style={{ fontSize:10, fontFamily:'"JetBrains Mono",monospace', color:'#44446a', whiteSpace:'nowrap' }}>
                Dataset Studio
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, overflowY:'auto', padding:'8px 6px', display:'flex', flexDirection:'column', gap:2 }}>
          <NavItem active={active==='builder'} color="var(--gold)"
            onClick={() => setActive('builder')} collapsed={collapsed}
            icon={<PlusIcon />} label="Nuevo Dataset" />

          {datasets.length > 0 && (
            <div style={{ height:1, background:'var(--ink-700)', margin:'6px 4px' }} />
          )}

          {datasets.map((ds, i) => (
            <NavItem key={ds.nombre}
              active={active===ds.nombre} color="var(--teal)"
              onClick={() => setActive(ds.nombre)} collapsed={collapsed}
              icon={<DsIcon i={i} />} label={ds.nombre}
              onClose={() => del(ds.nombre)} />
          ))}
        </nav>

        {/* Footer */}
        <div style={{ flexShrink:0, padding:'8px 6px', borderTop:'1px solid var(--ink-800)' }}>
          {!collapsed && (
            <div style={{ textAlign:'center', fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:'#2a2a3e', marginBottom:6 }}>
              {datasets.length}/{MAX} datasets
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)}
            style={{
              width:'100%', display:'flex', alignItems:'center', justifyContent:'center',
              padding:'6px', borderRadius:8, cursor:'pointer',
              background:'transparent', border:'none', color:'#44446a',
              transition:'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background='var(--ink-800)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
            title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div style={{ flex:1, minWidth:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {active === 'builder' && (
          <BuilderPanel onSave={save} savedCount={datasets.length} max={MAX} />
        )}
        {datasets.map(ds =>
          active === ds.nombre && <DatasetTab key={ds.nombre} dataset={ds} />
        )}
      </div>

      {/* Toast */}
      {notif && (
        <div className="fade-up" style={{
          position:'fixed', bottom:20, right:20, zIndex:50,
          padding:'10px 16px', borderRadius:12, fontSize:13, fontWeight:500,
          background: notif.type==='err' ? '#1f0a0a' : '#0a1f14',
          border: `1px solid ${notif.type==='err' ? 'var(--coral)' : 'var(--teal)'}`,
          color: notif.type==='err' ? 'var(--coral)' : 'var(--teal)',
        }}>
          {notif.msg}
        </div>
      )}
    </div>
  )
}

function NavItem({ active, color, onClick, collapsed, icon, label, onClose }) {
  const [hov, setHov] = useState(false)
  return (
    <div style={{ position:'relative' }}
         onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <button onClick={onClick} style={{
        width:'100%', display:'flex', alignItems:'center',
        gap: collapsed ? 0 : 9,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '8px 10px' : '7px 10px',
        borderRadius:8, cursor:'pointer', border: active ? `1px solid ${color}28` : '1px solid transparent',
        background: active ? color+'14' : hov ? 'var(--ink-800)' : 'transparent',
        color: active ? color : '#55556a',
        fontWeight: active ? 500 : 400,
        fontSize:13, transition:'all 0.12s', textAlign:'left',
      }}>
        <span style={{ width:16, height:16, flexShrink:0, display:'flex' }}>{icon}</span>
        {!collapsed && <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>}
        {!collapsed && onClose && hov && (
          <span onClick={e => { e.stopPropagation(); onClose() }}
            style={{ flexShrink:0, width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center',
                     borderRadius:4, fontSize:14, lineHeight:1, color:'#55556a', cursor:'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color='var(--coral)'}
            onMouseLeave={e => e.currentTarget.style.color='#55556a'}
          >×</span>
        )}
      </button>
      {/* Tooltip colapsado */}
      {collapsed && hov && (
        <div style={{
          position:'absolute', left:'calc(100% + 8px)', top:'50%', transform:'translateY(-50%)',
          padding:'4px 10px', borderRadius:6, fontSize:12, whiteSpace:'nowrap', zIndex:100,
          background:'var(--ink-700)', color:'#e8e8f0', border:'1px solid var(--ink-600)',
          pointerEvents:'none',
        }}>{label}</div>
      )}
    </div>
  )
}

const PlusIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width:'100%', height:'100%' }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
  </svg>
)
const DsIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" style={{ width:'100%', height:'100%' }}>
    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z"/>
  </svg>
)
const CollapseIcon = ({ collapsed }) => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width:16, height:16 }}>
    {collapsed
      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
    }
  </svg>
)
