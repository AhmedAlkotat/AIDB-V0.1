import { ACTION } from '../../../state/documentSession/documentReducer.js'
import { useTranslation } from '../../../hooks/useTranslation.js'
import { Icon } from '../../common/Icon.jsx'
import { DraftField } from './DraftField.jsx'

const hasText = (cells) => cells.some((cell) => cell.text.trim() !== '')

// Editable table: every cell is an input; rows and columns can be added and
// removed. Removing a row or column that holds text asks for confirmation.
// ctx: { dispatch(action), pageNumber, disabled, setPending, confirm({ title, text, confirmLabel, onConfirm }) }
export function TableEditor({ element, ctx, matches }) {
  const { t, formatNumber } = useTranslation()
  const { rows } = element.content
  const columnCount = rows[0].cells.length
  const base = { pageNumber: ctx.pageNumber, elementId: element.id }
  const run = (type, extra) => ctx.dispatch({ type, ...base, ...extra })

  function removeRow(index) {
    const proceed = () => run(ACTION.tableRowRemoved, { index })
    if (!hasText(rows[index].cells)) return proceed()
    return ctx.confirm({
      title: t('review.table.removeRowTitle', { row: formatNumber(index + 1) }),
      text: t('review.table.removeRowText'),
      confirmLabel: t('review.table.removeRowConfirm'),
      onConfirm: proceed,
    })
  }

  function removeColumn(index) {
    const proceed = () => run(ACTION.tableColumnRemoved, { index })
    if (!hasText(rows.map((row) => row.cells[index]))) return proceed()
    return ctx.confirm({
      title: t('review.table.removeColumnTitle', { column: formatNumber(index + 1) }),
      text: t('review.table.removeColumnText'),
      confirmLabel: t('review.table.removeColumnConfirm'),
      onConfirm: proceed,
    })
  }

  return (
    <div className="table-editor">
      <div className="table-editor__scroll">
        <table>
          <caption className="visually-hidden">{t('review.table.caption', { rows: formatNumber(rows.length), columns: formatNumber(columnCount) })}</caption>
          <thead>
            <tr>
              {rows[0].cells.map((cell, column) => (
                <th key={cell.id} scope="col">
                  <span className="table-editor__column-tools">
                    <span className="table-editor__column-number">{formatNumber(column + 1)}</span>
                    {!ctx.disabled && (
                      <>
                        <button type="button" className="icon-button icon-button--sm" aria-label={t('review.table.addColumnAfter', { column: formatNumber(column + 1) })} title={t('review.table.addColumnAfter', { column: formatNumber(column + 1) })} onClick={() => run(ACTION.tableColumnAdded, { index: column + 1 })}>
                          <Icon name="plus" size={14} />
                        </button>
                        <button type="button" className="icon-button icon-button--sm" disabled={columnCount === 1} aria-label={t('review.table.removeColumn', { column: formatNumber(column + 1) })} title={t('review.table.removeColumn', { column: formatNumber(column + 1) })} onClick={() => removeColumn(column)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </>
                    )}
                  </span>
                </th>
              ))}
              <th aria-hidden="true" className="table-editor__corner" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id}>
                {row.cells.map((cell, column) => (
                  <td key={cell.id}>
                    <DraftField
                      value={cell.text}
                      ctx={ctx}
                      fieldKey={`cell:${cell.id}`}
                      label={t('review.table.cell', { row: formatNumber(rowIndex + 1), column: formatNumber(column + 1) })}
                      ranges={matches[`cell:${cell.id}`]}
                      onCommit={(text) => run(ACTION.tableCellEdited, { row: rowIndex, column, text })}
                    />
                  </td>
                ))}
                <td className="table-editor__row-tools">
                  {!ctx.disabled && (
                    <>
                      <button type="button" className="icon-button icon-button--sm" aria-label={t('review.table.addRowAfter', { row: formatNumber(rowIndex + 1) })} title={t('review.table.addRowAfter', { row: formatNumber(rowIndex + 1) })} onClick={() => run(ACTION.tableRowAdded, { index: rowIndex + 1 })}>
                        <Icon name="plus" size={14} />
                      </button>
                      <button type="button" className="icon-button icon-button--sm" disabled={rows.length === 1} aria-label={t('review.table.removeRow', { row: formatNumber(rowIndex + 1) })} title={t('review.table.removeRow', { row: formatNumber(rowIndex + 1) })} onClick={() => removeRow(rowIndex)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
