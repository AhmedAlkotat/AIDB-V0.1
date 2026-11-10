import { useCallback } from 'react'
import { formatNumber, translate } from '../i18n/translations.js'
import { useLanguage } from './useLanguage.js'

// Translation helpers derived from the existing language context.
// This hook holds no state of its own; LanguageProvider remains the single
// source of truth for the current language.
export function useTranslation() {
  const { language, direction } = useLanguage()

  const t = useCallback((key, params) => translate(language, key, params), [language])
  const formatNumberForLanguage = useCallback(
    (value) => formatNumber(value, language),
    [language],
  )

  return { t, language, direction, formatNumber: formatNumberForLanguage }
}
