import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { planConversion } from '../../../domain/document/conversion.js'
import { createElement } from '../../../domain/document/elements.js'
import { ELEMENT_TYPE_LIST } from '../../../domain/document/schema.js'
import { searchPageElements } from '../../../domain/document/search.js'
import { useTranslation } from '../../../hooks/useTranslation.js'
import { ACTION } from '../../../state/documentSession/documentReducer.js'
import { Alert } from '../../common/Alert.jsx'
import { ConfirmDialog } from '../ConfirmDialog.jsx'
import { getErrorMessageKey } from '../errorMessages.js'
import { summarizeElement } from '../elementSummary.js'
import { ElementCard } from './ElementCard.jsx'
import { InsertPoint } from './InsertPoint.jsx'

// A table with real content, or unclassified data with preserved raw data, is
// "complex": deleting it asks for confirmation (it can still be undone).
function isComplex(element) {
  if (element.type === 'table') return element.content.rows.some((row) => row.cells.some((cell) => cell.text.trim() !== ''))
  return element.type === 'unclassified' && element.content.raw !== null
}

function newElementFor(type) {
  // Everything created here is labelled "manual" (typed by a person); the label stays internal (decision 49).
  return createElement(type, {
    source: { kind: 'manual' },
    ...(type === 'table' ? { content: { rows: [['', ''], ['', '']] } } : {}),
  })
}

// The editor of the current page. It edits the page's elements; with `types` it shows only the elements of
// those types (one tab of the review: texts, tables or fields) while the page keeps ONE reading order: every
// position given to the session is a position in the WHOLE page, so editing inside a tab never disturbs the
// other tabs' content (unclassified content stays on the page and in the JSON). All changes go through
// `dispatch` (the session -> Phase 1 reducer).
//
// Props: { pageNumber, elements, types (null = every type), query, disabled, dispatch(action),
//          setPending(key, flag, commitNow), onActivate(element | null) }
export function StructuredEditor({ pageNumber, elements, types = null, query, disabled, dispatch, setPending, onActivate }) {
  const { t, formatNumber } = useTranslation()
  const listRef = useRef(null)
  const [failure, setFailure] = useState(null)
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [drag, setDrag] = useState(null) // { from, over, position } — positions among the SHOWN elements
  const focusRequest = useRef(null) // id of an element just added, to move focus into
  const search = useMemo(() => searchPageElements(elements, query), [elements, query])

  // The shown elements with their position in the whole page.
  const entries = useMemo(
    () => elements.map((element, fullIndex) => ({ element, fullIndex })).filter(({ element }) => types === null || types.includes(element.type)),
    [elements, types],
  )
  const addTypes = types ?? ELEMENT_TYPE_LIST
  const endIndex = entries.length > 0 ? entries.at(-1).fullIndex + 1 : elements.length

  // Every action shows its refusal (if any) instead of failing silently.
  const ctx = useMemo(
    () => ({
      pageNumber,
      disabled,
      setPending,
      confirm: setPendingConfirm,
      onActivate,
      dispatch(action) {
        const result = dispatch({ pageNumber, ...action })
        setFailure(result.ok ? null : result)
        return result
      },
    }),
    [pageNumber, disabled, setPending, dispatch, onActivate],
  )

  // After adding an element, move focus into it.
  useEffect(() => {
    const id = focusRequest.current
    if (!id) return
    const card = listRef.current?.querySelector(`[data-element-id="${CSS.escape(id)}"]`)
    if (!card) return
    focusRequest.current = null
    card.scrollIntoView?.({ block: 'nearest' })
    card.querySelector('input:not([readonly]), textarea:not([readonly])')?.focus()
  }, [elements])

  function addElement(type, fullIndex) {
    const element = newElementFor(type)
    const result = ctx.dispatch({ type: ACTION.elementAdded, element, index: fullIndex })
    if (result.ok) focusRequest.current = element.id
  }

  // `shownTarget` is a position among the shown elements.
  function move(element, shownTarget) {
    const target = entries[shownTarget]
    if (target) ctx.dispatch({ type: ACTION.elementMoved, elementId: element.id, toIndex: target.fullIndex })
  }

  function remove(element) {
    const proceed = () => ctx.dispatch({ type: ACTION.elementRemoved, elementId: element.id })
    if (!isComplex(element)) return proceed()
    return setPendingConfirm({
      title: t('review.delete.title'),
      text: t('review.delete.text'),
      confirmLabel: t('review.delete.confirm'),
      onConfirm: proceed,
    })
  }

  function changeType(element, targetType) {
    let plan
    try {
      plan = planConversion(element, targetType)
    } catch {
      setFailure({ code: 'INVALID_CONVERSION' })
      return
    }
    const convert = (confirmed) => ctx.dispatch({ type: ACTION.elementTypeChanged, elementId: element.id, targetType, confirmed })
    if (plan.lossless) {
      convert(false)
      return
    }
    // Lossy: show what would be lost and what the result would look like, then ask.
    const preview = summarizeElement(plan.preview)
    setPendingConfirm({
      title: t('review.convert.title'),
      confirmLabel: t('review.convert.confirm'),
      tone: 'danger',
      text: (
        <>
          <p>{t('review.convert.intro', { from: t(`review.element.types.${plan.from}`), to: t(`review.element.types.${plan.to}`) })}</p>
          <ul className="confirm-list">
            {plan.lostData.map((lost) => (
              <li key={lost.code}>{t(`review.convert.lost.${lost.code}`)}</li>
            ))}
          </ul>
          <p className="confirm-preview">
            <strong>{t('review.convert.preview')}</strong>
            <span dir="auto">{preview.text || t('review.convert.emptyPreview')}</span>
          </p>
          <p className="confirm-note">{t('review.convert.undoNote')}</p>
        </>
      ),
      onConfirm: () => convert(true),
    })
  }

  // ---- drag and drop (the move buttons are the keyboard alternative) -----------
  const dragHandlersFor = (index) => ({
    onDragStart(event) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
      const card = event.currentTarget.closest('.element-card')
      if (card) event.dataTransfer.setDragImage(card, 20, 20)
      setDrag({ from: index, over: null, position: null })
    },
    onDragOver(event) {
      if (!drag) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const rect = event.currentTarget.getBoundingClientRect()
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      if (drag.over !== index || drag.position !== position) setDrag({ ...drag, over: index, position })
    },
    onDrop(event) {
      if (!drag || drag.over === null) return
      event.preventDefault()
      const dragged = entries[drag.from]
      const over = entries[drag.over]
      // moveElement takes the final index of the dragged element, in the whole page.
      let target = drag.position === 'before' ? over.fullIndex : over.fullIndex + 1
      if (dragged.fullIndex < target) target -= 1
      setDrag(null)
      if (target !== dragged.fullIndex) ctx.dispatch({ type: ACTION.elementMoved, elementId: dragged.element.id, toIndex: target })
    },
    onDragEnd() {
      setDrag(null)
    },
  })

  const readOnlyNotice = disabled && <p className="editor-notice">{t('review.editor.readOnly')}</p>

  return (
    <div className="structured-editor">
      {failure && (
        <Alert tone="error" title={t('review.errors.title')} onDismiss={() => setFailure(null)} dismissLabel={t('review.errors.dismiss')}>
          {t(getErrorMessageKey(failure.code))}
        </Alert>
      )}
      {readOnlyNotice}
      {query?.trim() && (
        <p className="search-summary" role="status">
          {search.total > 0 ? t('review.search.results', { count: formatNumber(search.total) }) : t('review.search.none')}
        </p>
      )}

      <ol className="element-list" ref={listRef} aria-label={t('review.editor.listLabel')}>
        {entries.length === 0 && !disabled && <InsertPoint index={0} count={0} types={addTypes} onAdd={(type) => addElement(type, endIndex)} isProminent />}
        {entries.length === 0 && disabled && <li className="editor-empty">{t('review.editor.empty')}</li>}
        {entries.map(({ element, fullIndex }, index) => (
          <Fragment key={element.id}>
            {!disabled && <InsertPoint index={index} count={entries.length} types={addTypes} onAdd={(type) => addElement(type, fullIndex)} />}
            <ElementCard
              element={element}
              index={index}
              count={entries.length}
              ctx={ctx}
              matches={search.byElement[element.id]?.fields ?? {}}
              isMatch={search.matchedElementIds.has(element.id)}
              dropPosition={drag && drag.over === index && drag.from !== index ? drag.position : null}
              dragHandlers={dragHandlersFor(index)}
              onChangeType={changeType}
              onMove={move}
              onDelete={remove}
            />
          </Fragment>
        ))}
        {entries.length > 0 && !disabled && <InsertPoint index={entries.length} count={entries.length} types={addTypes} onAdd={(type) => addElement(type, endIndex)} />}
      </ol>

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title}
        confirmLabel={pendingConfirm?.confirmLabel}
        cancelLabel={t('review.confirm.cancel')}
        tone={pendingConfirm?.tone ?? 'danger'}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          const { onConfirm } = pendingConfirm
          setPendingConfirm(null)
          onConfirm()
        }}
      >
        {typeof pendingConfirm?.text === 'string' ? <p>{pendingConfirm.text}</p> : pendingConfirm?.text}
      </ConfirmDialog>
    </div>
  )
}
