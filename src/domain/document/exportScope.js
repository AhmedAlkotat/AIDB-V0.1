// What an export contains (decisions 8 and 46), as pure functions.
//
//   - only APPROVED results: the export is built from an approved version, never from a draft;
//   - only the SELECTED pages that are approved (reviewed); pages that were not selected or never
//     processed are not part of it;
//   - the ORIGINAL page order, with the original page number of every page kept in the data
//     (`sourcePage`), also when only some pages of the PDF were selected;
//   - the complete original document is a separate download (decision 46), never an export.
//
// Formats: Word, Excel, PDF and JSON (decision 8). Producing Word/Excel/PDF files needs a server
// (Batch E); only the dataset and the JSON text can be built here.

import { PAGE_UI_STATUS, getPageUiStatus } from './pageStatus.js'

export const EXPORT_FORMAT = Object.freeze({ docx: 'docx', xlsx: 'xlsx', pdf: 'pdf', json: 'json' })
export const EXPORT_FORMAT_LIST = Object.freeze(Object.values(EXPORT_FORMAT))

export const EXPORT_FORMAT_INFO = Object.freeze({
  docx: { extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { extension: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pdf: { extension: 'pdf', mimeType: 'application/pdf' },
  json: { extension: 'json', mimeType: 'application/json' },
})

// A page is exported when it is part of the selection and approved (reviewed). Approving a
// document needs every selected page reviewed, so for an approved version this keeps them all;
// the filter is what protects against a page that is not.
export const isExportablePage = (page, selectedPages) => selectedPages.includes(page.pageNumber) && getPageUiStatus(page) === PAGE_UI_STATUS.reviewed

// The export data of an approved version snapshot: { file, pageCount, pages: [{ sourcePage, elements }] }.
// Elements carry their type, order, content and optional location. Their internal source
// (AI / manual, decision 49) is NOT exported.
export function buildExportDataset(snapshot) {
  const pages = [...snapshot.pages]
    .filter((page) => isExportablePage(page, snapshot.selectedPages))
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => ({
      sourcePage: page.pageNumber,
      elements: page.elements.map((element) => ({ type: element.type, order: element.order, content: element.content, location: element.location ?? null })),
    }))
  return {
    file: { name: snapshot.file.name, totalPages: snapshot.file.totalPages },
    selectedPages: pages.map((page) => page.sourcePage),
    pageCount: pages.length,
    pages,
  }
}

export function buildExportFileName(documentName, format) {
  const base = String(documentName ?? 'document').replace(/\.[^./\\]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document'
  return `${base}.${EXPORT_FORMAT_INFO[format].extension}`
}

export function buildJsonExport(dataset, { version = null } = {}) {
  return JSON.stringify({ version, ...dataset }, null, 2)
}
