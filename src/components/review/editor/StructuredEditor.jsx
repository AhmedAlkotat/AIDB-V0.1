import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { planConversion } from '../../../domain/document/conversion.js'
import { createElement } from '../../../domain/document/elements.js'
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
  // Everything created here is labelled "manual" (typed by a person).
  return createElement(type, {
    source: { kind: 'manual' },
    ...(type === 'table' ? { content: { rows: [['', ''], ['', '']] } } : {}),
  })
}

// The single structured editor of the current page: every element of the page in
// reading order. All changes go through `dispatch` (the session -> Phase 1 reducer).
//
// Props: { pageNumber, elements, query, disabled, dispatch(action), setPending(key, flag, commitNow) }
export function StructuredEditor({ pageNumber, elements, query, disabled, dispatch, setPending }) {
  const { t, formatNumber } = useTranslation()
  const listRef = useRef(null)
  const [failure, setFailure] = useState(null)
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [drag, setDrag] = useState(null) // { from, over, position }
  const focusRequest = useRef(null) // id of an element just added, to move focus into
  const search = useMemo(() => searchPageElements(elements, query), [elements, query])

  // Every action shows its refusal (if any) instead of failing silently.
  const ctx = useMemo(
    () => ({
      pageNumber,
      disabled,
      setPending,
      confirm: setPendingConfirm,
      dispatch(action) {
        const result = dispatch({ pageNumber, ...action })
        setFailure(result.ok ? null : result)
        return result
      },
    }),
    [pageNumber, disabled, setPending, dispatch],
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

  function addElement(type, index) {
    const element = newElementFor(type)
    const result = ctx.dispatch({ type: ACTION.elementAdded, element, index })
    if (result.ok) focusRequest.current = element.id
  }

  function move(element, toIndex) {
    ctx.dispatch({ type: ACTION.elementMoved, elementId: element.id, toIndex })
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
      // moveElement takes the final index of the dragged element.
      let target = drag.position === 'before' ? drag.over : drag.over + 1
      if (drag.from < target) target -= 1
      setDrag(null)
      if (target !== drag.from) move(elements[drag.from], target)
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
        {elements.length === 0 && !disabled && <InsertPoint index={0} count={0} onAdd={addElement} isProminent />}
        {elements.length === 0 && disabled && <li className="editor-empty">{t('review.editor.empty')}</li>}
        {elements.map((element, index) => (
          <Fragment key={element.id}>
            {!disabled && <InsertPoint index={index} count={elements.length} onAdd={addElement} />}
            <ElementCard
              element={element}
              index={index}
              count={elements.length}
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
        {elements.length > 0 && !disabled && <InsertPoint index={elements.length} count={elements.length} onAdd={addElement} />}
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
