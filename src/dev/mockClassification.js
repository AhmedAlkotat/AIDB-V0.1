// DEVELOPMENT-ONLY stand-in for the AI's document classification and layout recognition. NOT real:
// it only looks at the file name (without its extension), so the archive's type filter and the "known
// layout / new layout" display can be tried. The real classification and template catalogue belong to the AI
// developer (see docs/batch-e-handover.md). An unrecognised name is NOT an error: it simply has no type and no known layout
// (a document is never rejected because it matches no template).

// Functional classes only (never the file extension): invoice, certificate, contract, administrative request;
// anything else is simply unclassified. Classification is optional metadata: processing and review never wait for it.
const RULES = [
  { pattern: /invoice|فاتورة/i, documentType: 'invoice', template: { id: 'tpl-demo-invoice', name: 'فاتورة (نموذج تجريبي)' } },
  { pattern: /certificate|شهادة/i, documentType: 'certificate', template: { id: 'tpl-demo-certificate', name: 'شهادة (نموذج تجريبي)' } },
  { pattern: /contract|عقد/i, documentType: 'contract', template: { id: 'tpl-demo-contract', name: 'عقد (نموذج تجريبي)' } },
  { pattern: /request|application|طلب/i, documentType: 'administrativeRequest', template: null },
]

// The extension is removed first so ".pdf" or ".png" can never influence the class.
const stripExtension = (fileName) => String(fileName ?? '').replace(/\.[a-z0-9]{1,5}$/i, '')

export function classifyByName(fileName) {
  const base = stripExtension(fileName)
  const rule = RULES.find((candidate) => candidate.pattern.test(base))
  return { documentType: rule?.documentType ?? null, template: rule?.template ?? null }
}

// The templates the simulated catalogue knows (read only, see services/templateService.js). A function, so
// nothing is computed (or kept in a production bundle) unless the simulation is used.
export const getMockTemplates = () => RULES.filter((rule) => rule.template).map((rule) => ({ ...rule.template, documentType: rule.documentType }))
