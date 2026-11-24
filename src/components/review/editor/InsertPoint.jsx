import { useEffect, useId, useRef, useState } from 'react'
import { ELEMENT_TYPE_LIST } from '../../../domain/document/schema.js'
import { useTranslation } from '../../../hooks/useTranslation.js'
import { Icon } from '../../common/Icon.jsx'

// "Add an element here": a small button that opens the list of element types.
// Used between elements, at the end of the page, and on an empty page.
//
// Accessibility and focus (disclosure pattern):
// - the trigger button stays in the page while the menu is open, with
//   aria-expanded / aria-controls, so keyboard focus is never lost;
// - opening moves focus to the first type; Escape, "cancel" and choosing a type
//   put focus back on the trigger (after adding, the editor then moves focus
//   into the new element);
// - every trigger has a name that says WHERE the element would be added, because
//   a page can have many identical "add an element here" buttons.
export function InsertPoint({ index, count = 0, onAdd, isProminent = false }) {
  const { t, formatNumber } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const menuId = useId()
  const triggerRef = useRef(null)
  const firstItemRef = useRef(null)
  const focusMenuOnOpen = useRef(false)

  useEffect(() => {
    if (isOpen && focusMenuOnOpen.current) {
      focusMenuOnOpen.current = false
      firstItemRef.current?.focus()
    }
  }, [isOpen])

  const isEmptyPage = count === 0
  let label
  if (isEmptyPage) label = t('review.insert.addFirst')
  else if (index >= count) label = t('review.insert.labelEnd', { count: formatNumber(count) })
  else label = t('review.insert.labelBefore', { position: formatNumber(index + 1), count: formatNumber(count) })

  function close({ restoreFocus }) {
    setIsOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  return (
    <li
      className={`insert-point${isProminent ? ' is-prominent' : ''}${isOpen ? ' is-open' : ''}`}
      onKeyDown={(event) => {
        if (isOpen && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close({ restoreFocus: true })
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="insert-point__button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={label}
        onClick={() => {
          if (isOpen) {
            close({ restoreFocus: true })
          } else {
            focusMenuOnOpen.current = true
            setIsOpen(true)
          }
        }}
      >
        <Icon name="plus" size={16} />
        {t(isProminent ? 'review.insert.addFirst' : 'review.insert.here')}
      </button>
      {isOpen && (
        <div id={menuId} className="insert-point__menu" role="group" aria-label={`${t('review.insert.chooseType')} — ${label}`}>
          {ELEMENT_TYPE_LIST.map((type, position) => (
            <button
              key={type}
              ref={position === 0 ? firstItemRef : undefined}
              type="button"
              className="button button--secondary button--sm"
              onClick={() => {
                // Focus goes back to the trigger first; when the element is added the
                // editor moves focus into it, and if adding is refused focus stays here.
                close({ restoreFocus: true })
                onAdd(type, index)
              }}
            >
              {t(`review.element.types.${type}`)}
            </button>
          ))}
          <button type="button" className="button button--sm insert-point__cancel" onClick={() => close({ restoreFocus: true })}>
            {t('review.insert.cancel')}
          </button>
        </div>
      )}
    </li>
  )
}
