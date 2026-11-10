import { useContext } from 'react'
import { LanguageContext } from '../contexts/languageContext.js'

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === null) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
