import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from './Icon.jsx'

const TONE_ICONS = {
  info: 'info',
  error: 'alertCircle',
  warning: 'fileWarning',
}

// Inline message box. `tone`: info | error | warning. Errors are announced
// assertively (role="alert"), other tones politely (role="status").
// Pass `onDismiss` to show a close button.
export function Alert({ tone = 'info', title, children, onDismiss, dismissLabel }) {
  const { t } = useTranslation()

  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={TONE_ICONS[tone]} size={22} className="alert__icon" />
      <div className="alert__body">
        {title && <p className="alert__title">{title}</p>}
        {children && <div className="alert__text">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="alert__dismiss"
          aria-label={dismissLabel ?? t('common.dismiss')}
          onClick={onDismiss}
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  )
}
