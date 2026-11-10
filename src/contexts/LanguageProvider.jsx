import { useEffect, useState } from 'react'
import { defaultLanguage, LanguageContext, languages } from './languageContext.js'

export function LanguageProvider({ children }) {
  const [language, updateLanguage] = useState(defaultLanguage)
  const direction = languages[language].direction

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = direction
  }, [language, direction])

  function setLanguage(nextLanguage) {
    if (!Object.hasOwn(languages, nextLanguage)) {
      throw new Error(`Unsupported language: ${nextLanguage}`)
    }
    updateLanguage(nextLanguage)
  }

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}
