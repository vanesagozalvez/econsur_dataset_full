import { useState } from 'react'

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : initial }
    catch { return initial }
  })
  const set = (next) => {
    const val = typeof next === 'function' ? next(value) : next
    setValue(val)
    try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
  }
  return [value, set]
}
