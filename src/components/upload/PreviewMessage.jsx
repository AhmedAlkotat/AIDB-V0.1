import { Icon } from '../common/Icon.jsx'

// Centered icon + title + text used for preview empty / fallback states.
export function PreviewMessage({ icon, title, text, children }) {
  return (
    <div className="preview__message">
      <span className="preview__message-icon">
        <Icon name={icon} size={28} />
      </span>
      <p className="preview__message-title">{title}</p>
      <p className="preview__message-text">{text}</p>
      {children}
    </div>
  )
}
