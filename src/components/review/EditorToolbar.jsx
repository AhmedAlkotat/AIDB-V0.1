import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'

// Undo / redo for the current page and the search box for the current page.
// Search only filters what is highlighted on THIS page; there is no jumping
// from match to match.
export function EditorToolbar({ canUndo, canRedo, undoDepth, redoDepth, disabled, onUndo, onRedo, query, onQueryChange }) {
  const { t, formatNumber } = useTranslation()

  return (
    <div className="editor-toolbar" role="toolbar" aria-label={t('review.toolbar.label')}>
      <div className="editor-toolbar__history">
        <button type="button" className="button button--secondary button--sm" disabled={disabled || !canUndo} title={t('review.toolbar.undoHint')} onClick={onUndo}>
          <Icon name="undo" size={16} className="icon--flip-rtl" />
          {t('review.toolbar.undo')}
          {undoDepth > 0 && <span className="editor-toolbar__count">{formatNumber(undoDepth)}</span>}
        </button>
        <button type="button" className="button button--secondary button--sm" disabled={disabled || !canRedo} title={t('review.toolbar.redoHint')} onClick={onRedo}>
          <Icon name="redo" size={16} className="icon--flip-rtl" />
          {t('review.toolbar.redo')}
          {redoDepth > 0 && <span className="editor-toolbar__count">{formatNumber(redoDepth)}</span>}
        </button>
      </div>

      <label className="editor-toolbar__search">
        <Icon name="search" size={16} />
        <span className="visually-hidden">{t('review.search.label')}</span>
        <input
          type="search"
          value={query}
          placeholder={t('review.search.placeholder')}
          dir="auto"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
    </div>
  )
}
