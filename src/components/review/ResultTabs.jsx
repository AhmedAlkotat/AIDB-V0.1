import { useId, useMemo, useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { JsonPreview } from './JsonPreview.jsx'
import { RESULT_TABS } from './resultTabs.js'
import { StructuredEditor } from './editor/StructuredEditor.jsx'

// The tabs of the review (see resultTabs.js). Editing, adding and deleting happen inside the tab, and an
// element's position is always its position in the whole page's reading order.
// `tab` / `onTabChange` are controlled by the page (so the selected tab survives a page change).
export function ResultTabs({ document, page, tab, onTabChange, query, disabled, dispatch, setPending, onActivate }) {
  const { t, formatNumber, direction } = useTranslation()
  const baseId = useId()
  const tabRefs = useRef({})

  const counts = useMemo(
    () => Object.fromEntries(RESULT_TABS.filter((entry) => entry.types).map((entry) => [entry.id, page.elements.filter((element) => entry.types.includes(element.type)).length])),
    [page.elements],
  )

  function onKeyDown(event) {
    const index = RESULT_TABS.findIndex((entry) => entry.id === tab)
    const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const backward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    let next = null
    if (event.key === forward) next = (index + 1) % RESULT_TABS.length
    else if (event.key === backward) next = (index - 1 + RESULT_TABS.length) % RESULT_TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = RESULT_TABS.length - 1
    if (next === null) return
    event.preventDefault()
    const id = RESULT_TABS[next].id
    onTabChange(id)
    tabRefs.current[id]?.focus()
  }

  const active = RESULT_TABS.find((entry) => entry.id === tab) ?? RESULT_TABS[0]

  return (
    <div className="result-tabs">
      <div className="result-tabs__list" role="tablist" aria-label={t('review.tabs.label')} onKeyDown={onKeyDown}>
        {RESULT_TABS.map((entry) => (
          <button
            key={entry.id}
            ref={(node) => {
              tabRefs.current[entry.id] = node
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${entry.id}`}
            aria-selected={entry.id === active.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={entry.id === active.id ? 0 : -1}
            className={`result-tabs__tab${entry.id === active.id ? ' is-active' : ''}`}
            data-tab={entry.id}
            onClick={() => onTabChange(entry.id)}
          >
            {t(`review.tabs.${entry.id}`)}
            {entry.types && <span className="result-tabs__count">{formatNumber(counts[entry.id])}</span>}
          </button>
        ))}
      </div>
      <div className="result-tabs__panel" role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${active.id}`}>
        {active.id === 'json' ? (
          <JsonPreview document={document} pageNumber={page.pageNumber} embedded />
        ) : (
          <>
            <p className="result-tabs__hint">{t(`review.tabs.hint.${active.id}`)}</p>
            <StructuredEditor
              key={`${page.pageNumber}-${active.id}`}
              pageNumber={page.pageNumber}
              elements={page.elements}
              types={active.types}
              query={query}
              disabled={disabled}
              dispatch={dispatch}
              setPending={setPending}
              onActivate={onActivate}
            />
          </>
        )}
      </div>
    </div>
  )
}
