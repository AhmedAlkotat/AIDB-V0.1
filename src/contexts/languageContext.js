import { createContext } from 'react'

export const languages = Object.freeze({
  ar: { label: 'العربية', direction: 'rtl' },
  en: { label: 'English', direction: 'ltr' },
})

export const defaultLanguage = 'ar'
export const LanguageContext = createContext(null)
