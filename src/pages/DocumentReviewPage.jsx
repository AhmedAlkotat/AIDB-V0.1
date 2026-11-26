import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Alert } from '../components/common/Alert.jsx'
import { Icon } from '../components/common/Icon.jsx'
import { ExportDialog } from '../components/documents/ExportDialog.jsx'
import { ApprovalPanel } from '../components/review/ApprovalPanel.jsx'
import { AttemptHistoryPanel } from '../components/review/AttemptHistoryPanel.jsx'
import { ConfirmDialog } from '../components/review/ConfirmDialog.jsx'
import { DocumentStateBanner } from '../components/review/DocumentStateBanner.jsx'
import { EditorToolbar } from '../components/review/EditorToolbar.jsx'
import { getHistoryShortcut, isModalDialogOpen } from '../components/review/historyShortcuts.js'
import { LockBanner } from '../components/review/LockBanner.jsx'
import { MockTools } from '../components/review/MockTools.jsx'
import { OriginalViewer } from '../components/review/OriginalViewer.jsx'
import { PageNavigator } from '../components/review/PageNavigator.jsx'
import { PageReviewBar } from '../components/review/PageReviewBar.jsx'
import { ProcessingPanel } from '../components/review/ProcessingPanel.jsx'
import { ProcessingStatusView } from '../components/review/ProcessingStatusView.jsx'
import { ResultTabs } from '../components/review/ResultTabs.jsx'
import { ReviewHeader } from '../components/review/ReviewHeader.jsx'
import { SplitPane } from '../components/review/SplitPane.jsx'
import { VersionHistoryPanel } from '../components/review/VersionHistoryPanel.jsx'
import { canViewDocument } from '../domain/document/access.js'
import { isDocumentApproved } from '../domain/document/approval.js'
import { findPage } from '../domain/document/document.js'
import { isBeingProcessed } from '../domain/document/lifecycle.js'
import { canExport, getDocumentActions } from '../domain/document/permissions.js'
import { isNewVersionDraft } from '../domain/document/versions.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useDocumentMeta, useDocumentSummary } from '../hooks/useDocumentSummary.js'
import { useNavigationGuard } from '../hooks/useNavigationGuard.js'
import { useReviewSession, useSessionView } from '../hooks/useReviewSession.js'
import { useTranslation } from '../hooks/useTranslation.js'
import { backFromReviewPath, ROUTES } from '../routes/paths.js'
import { documentStore } from '../services/documentStore.js'
import { documentWorkflowService } from '../services/documentWorkflowService.js'
import { ACTION } from '../state/documentSession/documentReducer.js'
import { selectRedoDepth, selectUndoDepth } from '../state/documentSession/documentSelectors.js'

// The review workspace of one document: the original page and the results (Texts / Tables / Fields / JSON tabs)
// side by side, page navigation, review confirmation, draft saving (automatic and the "Save draft" button),
// the edit lock, the processing attempts, the version history and approval. All state lives in the review
// session (see reviewSession.js); processing itself lives in the central queue, not here.
function ReviewWorkspace({ session, record, summary }) {
  const { t, formatNumber } = useTranslation()
  const user = useCurrentUser()
  const view = useSessionView(session)
  const meta = useDocumentMeta(record.id)
  const guard = useNavigationGuard(session)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('texts')
  const [highlight, setHighlight] = useState(null)
  const [isExporting, setIsExporting] = useState(false)

  const { editor, role } = view
  const { document } = editor
  const currentPage = editor.lastVisitedPage
  const page = findPage(document, currentPage)
  const isApproved = isDocumentApproved(view.approvalStatus)
  const isProcessing = page.processing.status === 'processing'
  // Without the document's edit lock nothing can be changed (decision 47): the lock status is "held" or the
  // lock is not used (null).
  const isLockedOut = view.lock !== null && view.lock.status !== 'held' && !isApproved
  const disabled = isApproved || isProcessing || view.approvalPending || isLockedOut
  const saveStatus = session.getEffectiveSaveStatus()
  const actions = getDocumentActions(user, summary)
  const isNewVersion = isNewVersionDraft(view.approvalStatus, meta?.versions ?? [])

  const dispatch = useCallback((action) => session.dispatch(action), [session])
  const setPending = useCallback((key, isPending, commitNow) => session.setUncommitted(key, isPending, commitNow), [session])
  const goTo = useCallback((pageNumber) => session.goToPage(pageNumber), [session])

  // The marked area follows the element the reviewer is on; it only exists when the model gave coordinates
  // (decision 50) and never matters otherwise.
  const activate = useCallback(
    (element, { reveal = false } = {}) => setHighlight(element?.location ? { page: currentPage, location: element.location, reveal } : null),
    [currentPage],
  )
  const shownHighlight = highlight?.page === currentPage ? highlight : null

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

  // Retry the whole document WITHOUT a new upload (decision 11): pending work is saved first; the queue takes it
  // from there and this screen then shows the processing status.
  const retryDocument = useCallback(async () => {
    const saved = await session.flushSave()
    if (saved.status === 'failed') return { ok: false, code: 'saveFailed' }
    try {
      await documentWorkflowService.retryDocument(record.id)
      return { ok: true }
    } catch (error) {
      return { ok: false, code: error?.code }
    }
  }, [session, record.id])

  return (
    <div className="page review-page">
      <ReviewHeader
        name={record.name}
        document={document}
        currentPage={currentPage}
        usesMockProcessing={record.usesMockProcessing}
        state={summary.state}
        isNewVersion={isNewVersion}
        template={meta?.template ?? null}
        documentType={meta?.documentType ?? null}
        saveStatus={saveStatus}
        lastSavedAt={view.lastSavedAt}
        isTemporaryStorage={view.isTemporaryStorage}
        canSave={!isApproved && (view.lock === null || view.lock.status === 'held')}
        onRetrySave={() => session.retrySave()}
        onSaveDraft={() => session.saveDraft()}
      />

      <p>
        <Link className="button button--secondary button--sm" to={backFromReviewPath(isApproved)}>
          <Icon name="chevronLeft" size={16} className="icon--flip-rtl" />
          {t(isApproved ? 'review.backToArchive' : 'review.back')}
        </Link>
      </p>

      <LockBanner lock={view.lock} isApproved={isApproved} hasUnsaved={saveStatus !== 'saved'} onRequest={() => session.requestEditLock()} />
      <DocumentStateBanner state={summary.state} failureCode={summary.failureCode} canRetry={actions.retry && !isLockedOut} onRetry={retryDocument} />

      <PageNavigator pages={document.pages} selectedPages={document.selectedPages} currentPage={currentPage} onGoTo={goTo} />

      <SplitPane
        start={<OriginalViewer file={record.file} pageNumber={currentPage} highlight={shownHighlight} />}
        end={
          <section className="card editor-panel" aria-labelledby="editor-title">
            <h3 id="editor-title">{t('review.editor.title')}</h3>
            <ProcessingPanel
              page={page}
              isMock={record.usesMockProcessing}
              isApproved={isApproved || view.approvalPending || isLockedOut}
              notice={view.notices[currentPage]}
              candidate={view.candidates[currentPage]}
              onProcess={() => session.processPage(currentPage)}
              onDismissNotice={() => session.dismissNotice(currentPage)}
              onAccept={() => session.acceptCandidate(currentPage)}
              onKeep={() => session.discardCandidate(currentPage)}
            />
            <PageReviewBar page={page} isApproved={isApproved} isApprovalPending={view.approvalPending} isLockedOut={isLockedOut} hasPendingEdits={view.uncommittedCount > 0} onConfirm={() => session.confirmPageReview(currentPage)} />
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
            <ResultTabs document={document} page={page} tab={tab} onTabChange={setTab} query={query} disabled={disabled} dispatch={dispatch} setPending={setPending} onActivate={activate} />
          </section>
        }
      />

      <ApprovalPanel
        eligibility={session.getApprovalEligibility()}
        isApproved={isApproved}
        canCreateNewVersion={session.canCreateNewVersion()}
        role={role}
        isApprovalPending={view.approvalPending}
        onApprove={() => session.requestApproval()}
        onNewVersion={() => session.requestNewVersion()}
        onExport={isApproved && canExport(user, summary) ? () => setIsExporting(true) : undefined}
      />

      {meta && (
        <VersionHistoryPanel versions={meta.versions} isDraft={isNewVersion} getVersion={(number) => documentStore.getVersion(record.id, number)} />
      )}
      {meta && <AttemptHistoryPanel attempts={meta.attempts} acceptedResultCounts={meta.acceptedResultCounts} />}

      {import.meta.env.DEV && record.usesMockProcessing && <MockTools pageNumber={currentPage} documentId={record.id} />}

      {isExporting && <ExportDialog item={summary} onClose={() => setIsExporting(false)} />}

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

// Opens the review session of a document that already has content to review (or is approved).
function ReviewLoader({ documentId, summary }) {
  const { t } = useTranslation()
  const result = useReviewSession(documentId)

  if (result.status === 'ready') {
    return <ReviewWorkspace session={result.session} record={result.record} summary={summary} />
  }

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
        <BackToQueue />
      </section>
    </div>
  )
}

function BackToQueue() {
  const { t } = useTranslation()
  return (
    <Link className="button button--secondary" to={ROUTES.corrections}>
      <Icon name="fileWarning" size={18} />
      {t('review.back')}
    </Link>
  )
}

export default function DocumentReviewPage() {
  const { documentId } = useParams()
  // A new session (and fresh local state) for every document.
  return <LoadedReview key={documentId} documentId={documentId} />
}

// Decides what the address shows: nothing (unknown or deleted document), a refusal (someone else's document),
// the processing status (Pending / Processing: no content yet) or the review. Once the status view was shown
// it STAYS until the user asks to open the review (decisions 2 and 3: finishing never redirects by itself).
function LoadedReview({ documentId }) {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const summary = useDocumentSummary(documentId)
  const [mode, setMode] = useState(() => (summary && isBeingProcessed(summary.state) ? 'status' : 'review'))

  // A retry started from the review hands the document back to the queue: show the status from then on.
  if (summary && mode === 'review' && isBeingProcessed(summary.state)) setMode('status')

  if (!summary) {
    return (
      <div className="page review-page">
        <section className="card review-message" aria-live="polite">
          <Alert tone="warning" title={t('review.missing.title')}>
            {t('review.missing.text')}
          </Alert>
          <BackToQueue />
        </section>
      </div>
    )
  }
  if (!canViewDocument({ role: user.role, userId: user.id, ownerId: summary.ownerId })) {
    return (
      <div className="page review-page">
        <section className="card review-message" aria-live="polite">
          <Alert tone="warning" title={t('review.forbidden.title')}>
            {t('review.forbidden.text')}
          </Alert>
          <BackToQueue />
        </section>
      </div>
    )
  }

  if (mode === 'status') {
    const record = documentStore.get(documentId)
    return <ProcessingStatusView summary={summary} file={record?.file ?? null} firstPage={record?.snapshot.selectedPages[0] ?? 1} onOpenReview={() => setMode('review')} />
  }
  return <ReviewLoader documentId={documentId} summary={summary} />
}

