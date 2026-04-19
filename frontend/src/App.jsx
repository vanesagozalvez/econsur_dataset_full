import { useState } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import BuilderPanel from './components/BuilderPanel'
import DatasetTab from './components/DatasetTab'

const MAX_DATASETS = 5

export default function App() {
  const [savedDatasets, setSavedDatasets] = useLocalStorage('econsur_datasets_v1', [])
  const [activeTab, setActiveTab] = useState('builder')
  const [notification, setNotification] = useState(null)

  const notify = (msg, type = 'success') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3500)
  }

  const saveDataset = (ds) => {
    if (savedDatasets.length >= MAX_DATASETS) {
      notify(`Límite de ${MAX_DATASETS} datasets alcanzado. Eliminá uno para continuar.`, 'error')
      return false
    }
    if (savedDatasets.find(d => d.nombre === ds.nombre)) {
      notify(`Ya existe un dataset con el nombre "${ds.nombre}".`, 'error')
      return false
    }
    setSavedDatasets(prev => [...prev, ds])
    setActiveTab(ds.nombre)
    notify(`Dataset "${ds.nombre}" guardado correctamente.`)
    return true
  }

  const deleteDataset = (nombre) => {
    setSavedDatasets(prev => prev.filter(d => d.nombre !== nombre))
    if (activeTab === nombre) setActiveTab('builder')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0a0f' }}>
      {/* ── Header ── */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #e8a820, #38d9c0)' }}>
            <span className="text-black font-bold text-sm">E</span>
          </div>
          <h1 className="font-display text-xl text-white tracking-tight">
            Econ<span style={{ color: '#e8a820' }}>Sur</span>
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                style={{ background: '#1a1a24', color: '#88889a', border: '1px solid #24243a' }}>
            Dataset Studio
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: '#55556a' }}>
          <span className="font-mono">{savedDatasets.length}/{MAX_DATASETS} datasets</span>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <nav className="border-b border-white/5 px-4 flex items-center gap-1 overflow-x-auto"
           style={{ background: '#0e0e16', minHeight: '44px' }}>
        {/* Builder tab */}
        <button
          onClick={() => setActiveTab('builder')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'builder'
              ? 'text-white border-b-2'
              : 'hover:text-white/70'
          }`}
          style={activeTab === 'builder'
            ? { color: '#e8a820', borderColor: '#e8a820', background: '#1a1a24' }
            : { color: '#55556a' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Dataset
        </button>

        {/* Divider */}
        {savedDatasets.length > 0 && (
          <div className="w-px h-5 mx-1" style={{ background: '#24243a' }} />
        )}

        {/* Dataset tabs */}
        {savedDatasets.map(ds => (
          <button
            key={ds.nombre}
            onClick={() => setActiveTab(ds.nombre)}
            className={`px-4 py-2.5 text-sm rounded-t transition-all whitespace-nowrap flex items-center gap-2 group ${
              activeTab === ds.nombre ? 'border-b-2' : 'hover:text-white/70'
            }`}
            style={activeTab === ds.nombre
              ? { color: '#38d9c0', borderColor: '#38d9c0', background: '#1a1a24', fontWeight: 500 }
              : { color: '#55556a' }}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" />
            </svg>
            {ds.nombre}
            <span
              onClick={(e) => { e.stopPropagation(); deleteDataset(ds.nombre) }}
              className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:text-red-400 cursor-pointer"
              style={{ color: '#55556a', fontSize: '14px', lineHeight: 1 }}
            >×</span>
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'builder' && (
          <BuilderPanel
            onSave={saveDataset}
            savedCount={savedDatasets.length}
            maxDatasets={MAX_DATASETS}
          />
        )}
        {savedDatasets.map(ds => (
          activeTab === ds.nombre && (
            <DatasetTab key={ds.nombre} dataset={ds} />
          )
        ))}
      </main>

      {/* ── Notification ── */}
      {notification && (
        <div className="fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl animate-fade-in z-50"
             style={{
               background: notification.type === 'error' ? '#2a1010' : '#0f2a1a',
               border: `1px solid ${notification.type === 'error' ? '#ff5454' : '#38d9c0'}`,
               color: notification.type === 'error' ? '#ff7c7c' : '#38d9c0',
             }}>
          {notification.msg}
        </div>
      )}
    </div>
  )
}
