import { useState } from 'react'
import { getAdjacentPage, getPageListWindow, getSelectedPageIndex, NAVIGATION, resolvePageJump } from '../../domain/document/pageNavigation.js'
import { useTranslation } from '../../hooks/useTranslation.js'
import { Icon } from '../common/Icon.jsx'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { PageStatusBadge } from './PageStatusBadges.jsx'

const LIST_WINDOW = 50

// Moves between the SELECTED pages only: previous, next, a typed page number
// and a list. Only one page is shown and edited at a time, and the list shows a
// window of 50 pages, so a 1,000-page document never mounts every page.
export function PageNavigator({ pages, selectedPages, currentPage, onGoTo }) {
  const { t, formatNumber } = useTranslation()
  const [jump, setJump] = useState('')
  const [jumpError, setJumpError] = useState(null)
  const [isListOpen, setIsListOpen] = useState(false)
  const [windowIndex, setWindowIndex] = useState(0)

  const index = getSelectedPageIndex(selectedPages, currentPage)
  const previous = getAdjacentPage(selectedPages, currentPage, NAVIGATION.previous)
  const next = getAdjacentPage(selectedPages, currentPage, NAVIGATION.next)

  function submitJump(event) {
    event.preventDefault()
    const result = resolvePageJump(selectedPages, jump)
    if (!result.ok) {
      setJumpError(result.reason)
      return
    }
    setJumpError(null)
    setJump('')
    onGoTo(result.pageNumber)
  }

  function openList() {
    setWindowIndex(Math.floor(Math.max(0, index) / LIST_WINDOW))
    setIsListOpen(true)
  }

  const list = getPageListWindow(selectedPages, windowIndex, LIST_WINDOW)
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]))

  return (
    <nav className="card page-navigator" aria-label={t('review.nav.ariaLabel')}>
      <div className="page-navigator__main">
        <button type="button" className="button button--secondary" disabled={previous === null} onClick={() => onGoTo(previous)}>
          <Icon name="chevronLeft" size={18} className="icon--flip-rtl" />
          {t('review.nav.previous')}
        </button>
        <p className="page-navigator__current" aria-live="polite">
          <strong>{t('review.nav.current', { page: formatNumber(currentPage) })}</strong>
          <span>{t('review.header.position', { index: formatNumber(index + 1), count: formatNumber(selectedPages.length) })}</span>
        </p>
        <button type="button" className="button button--secondary" disabled={next === null} onClick={() => onGoTo(next)}>
          {t('review.nav.next')}
          <Icon name="chevronRight" size={18} className="icon--flip-rtl" />
        </button>
      </div>

      <div className="page-navigator__tools">
        <form className="page-navigator__jump" onSubmit={submitJump} noValidate>
          <label htmlFor="review-jump">{t('review.nav.jumpLabel')}</label>
          <input
            id="review-jump"
            type="text"
            inputMode="numeric"
            value={jump}
            placeholder={t('review.nav.jumpPlaceholder')}
            aria-invalid={jumpError ? 'true' : undefined}
            aria-describedby={jumpError ? 'review-jump-error' : undefined}
            onChange={(event) => {
              setJump(event.target.value)
              setJumpError(null)
            }}
          />
          <button type="submit" className="button button--secondary button--sm">
            {t('review.nav.jumpGo')}
          </button>
        </form>
        <button type="button" className="button button--secondary button--sm" aria-haspopup="dialog" onClick={openList}>
          <Icon name="list" size={16} />
          {t('review.nav.allPages')}
        </button>
      </div>
      {jumpError && (
        <p id="review-jump-error" className="page-navigator__error" role="alert">
          {t(`review.nav.jumpErrors.${jumpError}`)}
        </p>
      )}

      <ConfirmDialog open={isListOpen} title={t('review.nav.listTitle')} cancelLabel={t('review.nav.close')} onCancel={() => setIsListOpen(false)}>
        <ul className="page-list">
          {list.pages.map((pageNumber) => (
            <li key={pageNumber}>
              <button
                type="button"
                className={`page-list__item${pageNumber === currentPage ? ' is-current' : ''}`}
                aria-current={pageNumber === currentPage ? 'page' : undefined}
                onClick={() => {
                  setIsListOpen(false)
                  onGoTo(pageNumber)
                }}
              >
                <span>{t('review.nav.current', { page: formatNumber(pageNumber) })}</span>
                {pageByNumber.get(pageNumber) && <PageStatusBadge page={pageByNumber.get(pageNumber)} />}
              </button>
            </li>
          ))}
        </ul>
        {list.pageCount > 1 && (
          <div className="page-list__paging">
            <button type="button" className="button button--secondary button--sm" disabled={list.windowIndex === 0} onClick={() => setWindowIndex(list.windowIndex - 1)}>
              {t('review.nav.listPrev')}
            </button>
            <span>{t('review.nav.listWindow', { from: formatNumber(list.from + 1), to: formatNumber(list.to), total: formatNumber(list.total) })}</span>
            <button type="button" className="button button--secondary button--sm" disabled={list.windowIndex >= list.pageCount - 1} onClick={() => setWindowIndex(list.windowIndex + 1)}>
              {t('review.nav.listNext')}
            </button>
          </div>
        )}
      </ConfirmDialog>
    </nav>
  )
}
