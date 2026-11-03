import { useContext } from 'react'
import { AppContext } from './contextInstance'

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppContext must be used inside AppProvider')
  return context
}
