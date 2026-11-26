// Approved versions (decision 14), as pure functions.
//
//   - an employee never edits an approved document, not even their own;
//   - only the Admin can create a NEW version of it, and the new version needs a new approval;
//   - the previous versions stay, with the date of the change and of the approval.
//
// A version: { number, approvedAt, approvedBy, approvedByName, snapshot } where `snapshot` is the
// serialized document exactly as it was approved. The history of versions and approvals is
// independent of the audit log: the log's retention period never deletes it (decision 33).

import { deepClone } from './utils.js'

export const latestVersion = (versions) => (versions.length === 0 ? null : versions.reduce((a, b) => (b.number > a.number ? b : a)))

export const getVersion = (versions, number) => versions.find((version) => version.number === number) ?? null

// The next approved version: numbers only ever grow. The snapshot is copied, so the stored
// version can never change afterwards.
export function appendApprovedVersion(versions, { snapshot, approvedAt, approvedBy, approvedByName }) {
  const number = (latestVersion(versions)?.number ?? 0) + 1
  return [...versions, { number, approvedAt, approvedBy, approvedByName: approvedByName ?? null, snapshot: deepClone(snapshot) }]
}

// A new version in progress: the latest approved version exists, but the document is not approved
// again yet (the Admin created an editable copy that needs its own approval, decision 14).
export const isNewVersionDraft = (approvalStatus, versions) => approvalStatus !== 'approved' && versions.length > 0

// What the history list shows (never the content itself).
export function summarizeVersions(versions) {
  const current = latestVersion(versions)?.number ?? null
  return [...versions]
    .sort((a, b) => b.number - a.number)
    .map((version) => ({
      number: version.number,
      approvedAt: version.approvedAt,
      approvedBy: version.approvedBy,
      approvedByName: version.approvedByName,
      pageCount: version.snapshot.pages.length,
      isLatest: version.number === current,
    }))
}
