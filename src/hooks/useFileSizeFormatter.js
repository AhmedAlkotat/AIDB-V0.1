import { useCallback } from 'react'
import { getFileSizeParts } from '../utils/documentFile.js'
import { useTranslation } from './useTranslation.js'

// Returns a function that formats a byte count for the current language,
// e.g. "2.4 MB" / "٢٫٤ ميجابايت".
export function useFileSizeFormatter() {
  const { t, language } = useTranslation()

  return useCallback(
    (bytes) => {
      const { value, unit } = getFileSizeParts(bytes)
      const formatted = new Intl.NumberFormat(language, {
        maximumFractionDigits: unit === 'B' ? 0 : 1,
      }).format(value)
      return t(`upload.sizeUnits.${unit}`, { value: formatted })
    },
    [t, language],
  )
}
