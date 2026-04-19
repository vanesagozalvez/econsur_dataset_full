import { useState, useEffect } from 'react'

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setStoredValue = (newValue) => {
    try {
      const val = typeof newValue === 'function' ? newValue(value) : newValue
      setValue(val)
      localStorage.setItem(key, JSON.stringify(val))
    } catch (e) {
      console.error('localStorage error:', e)
    }
  }

  return [value, setStoredValue]
}
