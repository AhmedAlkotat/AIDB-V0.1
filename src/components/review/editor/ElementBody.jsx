import { HEADING_LEVELS } from '../../../domain/document/schema.js'
import { ACTION } from '../../../state/documentSession/documentReducer.js'
import { useTranslation } from '../../../hooks/useTranslation.js'
import { DraftField } from './DraftField.jsx'
import { TableEditor } from './TableEditor.jsx'

// The editable content of one element, by type (Phase 1 content model).
// Every change is dispatched as a Phase 1 action; nothing is mutated here.
export function ElementBody({ element, ctx, matches }) {
  const { t, formatNumber } = useTranslation()
  const edit = (patch) => ctx.dispatch({ type: ACTION.elementEdited, pageNumber: ctx.pageNumber, elementId: element.id, patch })
  const { content } = element

  switch (element.type) {
    case 'heading':
      return (
        <div className="element-body element-body--heading">
          <label className="element-body__level">
            <span>{t('review.element.headingLevel')}</span>
            <select
              value={content.level}
              disabled={ctx.disabled}
              onChange={(event) => edit({ level: Number(event.target.value) })}
            >
              {Array.from({ length: HEADING_LEVELS.max - HEADING_LEVELS.min + 1 }, (_, index) => HEADING_LEVELS.min + index).map((level) => (
                <option key={level} value={level}>
                  {formatNumber(level)}
                </option>
              ))}
            </select>
          </label>
          <DraftField
            value={content.text}
            ctx={ctx}
            fieldKey={`${element.id}:text`}
            label={t('review.element.headingText')}
            ranges={matches.text}
            className="editor-input--heading"
            onCommit={(text) => edit({ text })}
          />
        </div>
      )

    case 'paragraph':
      return (
        <div className="element-body">
          <DraftField
            multiline
            rows={3}
            value={content.text}
            ctx={ctx}
            fieldKey={`${element.id}:text`}
            label={t('review.element.paragraphText')}
            ranges={matches.text}
            onCommit={(text) => edit({ text })}
          />
        </div>
      )

    case 'field':
      return (
        <div className="element-body element-body--field">
          <label className="element-body__labelled">
            <span>{t('review.element.fieldKey')}</span>
            <DraftField value={content.key} ctx={ctx} fieldKey={`${element.id}:key`} label={t('review.element.fieldKey')} ranges={matches.key} onCommit={(key) => edit({ key })} />
          </label>
          <label className="element-body__labelled">
            <span>{t('review.element.fieldValue')}</span>
            <DraftField multiline rows={1} value={content.value} ctx={ctx} fieldKey={`${element.id}:value`} label={t('review.element.fieldValue')} ranges={matches.value} onCommit={(value) => edit({ value })} />
          </label>
        </div>
      )

    case 'table':
      return <TableEditor element={element} ctx={ctx} matches={matches} />

    case 'unclassified':
      return (
        <div className="element-body">
          <DraftField
            multiline
            rows={2}
            value={content.text}
            ctx={ctx}
            fieldKey={`${element.id}:text`}
            label={t('review.element.unclassifiedText')}
            ranges={matches.text}
            onCommit={(text) => edit({ text })}
          />
          {content.raw !== null && (
            <details className="raw-data">
              <summary>{t('review.element.rawData')}</summary>
              <p className="raw-data__note">{t('review.element.rawDataNote')}</p>
              <pre dir="ltr" tabIndex={0}>
                {JSON.stringify(content.raw, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )

    default:
      return null
  }
}
