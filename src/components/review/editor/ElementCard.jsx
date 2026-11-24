import { ELEMENT_TYPE_LIST } from '../../../domain/document/schema.js'
import { useTranslation } from '../../../hooks/useTranslation.js'
import { Icon } from '../../common/Icon.jsx'
import { ElementBody } from './ElementBody.jsx'

// One element of the page, in document order: a drag handle, a type selector,
// move up/down buttons (the accessible alternative to dragging), delete, a
// label saying whether the content was typed by a person or extracted by the
// (mock) AI, and the editable body.
export function ElementCard({ element, index, count, ctx, matches, isMatch, dropPosition, dragHandlers, onChangeType, onMove, onDelete }) {
  const { t, formatNumber } = useTranslation()
  const isMock = element.source.details?.mock === true
  const position = t('review.element.position', { index: formatNumber(index + 1), count: formatNumber(count) })
  const typeLabel = t(`review.element.types.${element.type}`)

  return (
    <li
      className={`element-card element-card--${element.type}${isMatch ? ' is-match' : ''}${dropPosition ? ` is-drop-${dropPosition}` : ''}`}
      data-element-id={element.id}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
    >
      <div className="element-card__header">
        {!ctx.disabled && (
          <span
            className="element-card__grip"
            draggable
            aria-hidden="true"
            title={t('review.element.dragHint')}
            onDragStart={dragHandlers.onDragStart}
            onDragEnd={dragHandlers.onDragEnd}
          >
            <Icon name="grip" size={18} />
          </span>
        )}
        <span className="element-card__position">{position}</span>

        <label className="element-card__type">
          <span className="visually-hidden">{t('review.element.typeLabel', { position })}</span>
          <select value={element.type} disabled={ctx.disabled} onChange={(event) => onChangeType(element, event.target.value)}>
            {ELEMENT_TYPE_LIST.map((type) => (
              <option key={type} value={type}>
                {t(`review.element.types.${type}`)}
              </option>
            ))}
          </select>
        </label>

        {element.source.kind === 'manual' ? (
          <span className="badge badge--warning">{t('review.element.sourceManual')}</span>
        ) : (
          <span className="badge badge--neutral">{isMock ? t('review.element.sourceMock') : t('review.element.sourceAi')}</span>
        )}

        {!ctx.disabled && (
          <span className="element-card__tools">
            <button type="button" className="icon-button icon-button--sm" disabled={index === 0} aria-label={t('review.element.moveUp', { type: typeLabel, position })} title={t('review.element.moveUpShort')} onClick={() => onMove(element, index - 1)}>
              <Icon name="arrowUp" size={16} />
            </button>
            <button type="button" className="icon-button icon-button--sm" disabled={index === count - 1} aria-label={t('review.element.moveDown', { type: typeLabel, position })} title={t('review.element.moveDownShort')} onClick={() => onMove(element, index + 1)}>
              <Icon name="arrowDown" size={16} />
            </button>
            <button type="button" className="icon-button icon-button--sm icon-button--danger" aria-label={t('review.element.delete', { type: typeLabel, position })} title={t('review.element.deleteShort')} onClick={() => onDelete(element)}>
              <Icon name="trash" size={16} />
            </button>
          </span>
        )}
      </div>

      <ElementBody element={element} ctx={ctx} matches={matches} />
    </li>
  )
}
