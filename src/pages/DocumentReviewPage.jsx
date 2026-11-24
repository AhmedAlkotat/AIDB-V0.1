import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { ApprovalPanel } from '../components/review/ApprovalPanel.jsx'
import { ConfirmDialog } from '../components/review/ConfirmDialog.jsx'
import { StructuredEditor } from '../components/review/editor/StructuredEditor.jsx'
import { EditorToolbar } from '../components/review/EditorToolbar.jsx'
import { getHistoryShortcut, isModalDialogOpen } from '../components/review/historyShortcuts.js'
import { JsonPreview } from '../components/review/JsonPreview.jsx'
import { MockTools } from '../components/review/MockTools.jsx'
import { OriginalViewer } from '../components/review/OriginalViewer.jsx'
import { PageNavigator } from '../components/review/PageNavigator.jsx'
import { PageReviewBar } from '../components/review/PageReviewBar.jsx'
import { ProcessingPanel } from '../components/review/ProcessingPanel.jsx'
import { ReviewHeader } from '../components/review/ReviewHeader.jsx'
import { SplitPane } from '../components/review/SplitPane.jsx'
import { isDocumentApproved } from '../domain/document/approval.js'
import { findPage } from '../domain/document/document.js'
import { useNavigationGuard } from '../hooks/useNavigationGuard.js'
import { useReviewSession, useSessionView } from '../hooks/useReviewSession.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { backFromReviewPath, ROUTES } from '../routes/paths.js'
import { ACTION } from '../state/documentSession/documentReducer.js'
import { selectRedoDepth, selectUndoDepth } from '../state/documentSession/documentSelectors.js'

// The review workspace of one document: original page and structured editor side
// by side, page navigation, review confirmation, JSON preview, autosave state
// and approval. All state lives in the review session (see reviewSession.js).
function ReviewWorkspace({ session, record }) {
  const { t, formatNumber } = useTranslation()
  const view = useSessionView(session)
  const guard = useNavigationGuard(session)
  const [query, setQuery] = useState('')

  const { editor, role } = view
  const { document } = editor
  const currentPage = editor.lastVisitedPage
  const page = findPage(document, currentPage)
  const isApproved = isDocumentApproved(view.approvalStatus)
  const isProcessing = page.processing.status === 'processing'
  const disabled = isApproved || isProcessing || view.approvalPending
  const saveStatus = session.getEffectiveSaveStatus()

  const dispatch = useCallback((action) => session.dispatch(action), [session])
  const setPending = useCallback((key, isPending, commitNow) => session.setUncommitted(key, isPending, commitNow), [session])
  const goTo = useCallback((pageNumber) => session.goToPage(pageNumber), [session])

  // Ctrl+Z / Ctrl+Y outside text inputs (inside them the browser's own undo keeps
  // working) and never while a modal dialog is open (see historyShortcuts.js).
  useEffect(() => {
    function onKeyDown(event) {
      const shortcut = getHistoryShortcut(event, { modalOpen: isModalDialogOpen() })
      if (!shortcut) return
      dispatch({ type: shortcut === 'undo' ? ACTION.undone : ACTION.redone })
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  return (
    <div className="page review-page">
      <ReviewHeader
        name={record.name}
        document={document}
        currentPage={currentPage}
        usesMockProcessing={record.usesMockProcessing}
        isApproved={isApproved}
        saveStatus={saveStatus}
        isTemporaryStorage={view.isTemporaryStorage}
        onRetrySave={() => session.retrySave()}
      />

      <p>
        <Link className="button button--secondary button--sm" to={backFromReviewPath(isApproved)}>
          <Icon name="chevronLeft" size={16} className="icon--flip-rtl" />
          {t(isApproved ? 'review.backToArchive' : 'review.back')}
        </Link>
      </p>

      <PageNavigator pages={document.pages} selectedPages={document.selectedPages} currentPage={currentPage} onGoTo={goTo} />

      <SplitPane
        start={<OriginalViewer file={record.file} pageNumber={currentPage} />}
        end={
          <section className="card editor-panel" aria-labelledby="editor-title">
            <h3 id="editor-title">{t('review.editor.title')}</h3>
            <ProcessingPanel
              page={page}
              isMock={record.usesMockProcessing}
              isApproved={isApproved || view.approvalPending}
              notice={view.notices[currentPage]}
              candidate={view.candidates[currentPage]}
              onProcess={() => session.processPage(currentPage)}
              onDismissNotice={() => session.dismissNotice(currentPage)}
              onAccept={() => session.acceptCandidate(currentPage)}
              onKeep={() => session.discardCandidate(currentPage)}
            />
            <PageReviewBar page={page} isApproved={isApproved} isApprovalPending={view.approvalPending} hasPendingEdits={view.uncommittedCount > 0} onConfirm={() => session.confirmPageReview(currentPage)} />
            <EditorToolbar
              canUndo={selectUndoDepth(editor, currentPage) > 0}
              canRedo={selectRedoDepth(editor, currentPage) > 0}
              undoDepth={selectUndoDepth(editor, currentPage)}
              redoDepth={selectRedoDepth(editor, currentPage)}
              disabled={disabled}
              onUndo={() => dispatch({ type: ACTION.undone, pageNumber: currentPage })}
              onRedo={() => dispatch({ type: ACTION.redone, pageNumber: currentPage })}
              query={query}
              onQueryChange={setQuery}
            />
            <StructuredEditor
              key={currentPage}
              pageNumber={currentPage}
              elements={page.elements}
              query={query}
              disabled={disabled}
              dispatch={dispatch}
              setPending={setPending}
            />
            <JsonPreview document={document} pageNumber={currentPage} />
          </section>
        }
      />

      <ApprovalPanel
        eligibility={session.getApprovalEligibility()}
        isApproved={isApproved}
        canCreateNewVersion={session.canCreateNewVersion()}
        role={role}
        onApprove={() => session.requestApproval()}
        onNewVersion={() => session.requestNewVersion()}
      />

      {import.meta.env.DEV && record.usesMockProcessing && <MockTools pageNumber={currentPage} />}

      <ConfirmDialog
        open={guard.isBlocked}
        title={t('review.leave.title')}
        confirmLabel={t('review.leave.confirm')}
        cancelLabel={t('review.leave.stay')}
        tone="danger"
        onCancel={guard.stay}
        onConfirm={guard.leave}
      >
        <p>{t('review.leave.text')}</p>
        <ul className="confirm-list">
          {guard.reasons.map((reason) => (
            <li key={reason}>{t(`review.leave.reasons.${reason}`)}</li>
          ))}
        </ul>
      </ConfirmDialog>

      <p className="visually-hidden" role="status">
        {t('review.nav.announce', { page: formatNumber(currentPage) })}
      </p>
    </div>
  )
}

export default function DocumentReviewPage() {
  const { documentId } = useParams()
  // A new session (and fresh local state) for every document.
  return <LoadedReview key={documentId} documentId={documentId} />
}

function LoadedReview({ documentId }) {
  const { t } = useTranslation()
  const result = useReviewSession(documentId)

  if (result.status === 'ready') {
    return <ReviewWorkspace session={result.session} record={result.record} />
  }

  const back = (
    <Link className="button button--secondary" to={ROUTES.corrections}>
      <Icon name="fileWarning" size={18} />
      {t('review.back')}
    </Link>
  )

  return (
    <div className="page review-page">
      <section className="card review-message" aria-live="polite">
        {result.status === 'missing' && (
          <Alert tone="warning" title={t('review.missing.title')}>
            {t('review.missing.text')}
          </Alert>
        )}
        {result.status === 'forbidden' && (
          <Alert tone="warning" title={t('review.forbidden.title')}>
            {t('review.forbidden.text')}
          </Alert>
        )}
        {result.status === 'error' && (
          <Alert tone="error" title={t('review.loadError.title')}>
            {t('review.loadError.text')}
          </Alert>
        )}
        {back}
      </section>
    </div>
  )
}
