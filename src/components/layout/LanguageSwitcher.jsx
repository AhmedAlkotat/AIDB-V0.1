import { languages } from '../../contexts/languageContext.js'
import { useLanguage } from '../../hooks/useLanguage.js'
import { useTranslation } from '../../hooks/useTranslation.js'

const languageCodes = Object.keys(languages)

// AR / EN toggle that writes to the existing LanguageProvider state.
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()
  const { t } = useTranslation()

  return (
    <div className="lang-switch" role="group" aria-label={t('header.language')}>
      {languageCodes.map((code) => (
        <button
          key={code}
          type="button"
          className="lang-switch__option"
          lang={code}
          aria-pressed={language === code}
          aria-label={languages[code].label}
          title={languages[code].label}
          onClick={() => setLanguage(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
