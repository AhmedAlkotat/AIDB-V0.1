// System settings (frontend only, pure functions).
//
// The Admin decides these values (decisions 25–28, 33, 34, 36, 44, 48). WHICH VALUES ARE
// DEFAULTS IS NOT APPROVED: the decisions explicitly say that the examples (10 MB, 80 % and
// 90 %, 30/60/90 days ...) are not final, and the page limit default "comes after performance
// testing". Every default and every allowed range below is therefore PROVISIONAL, collected
// here in one place so it is easy to change once the requirements and the backend agree. The
// backend must validate on its own; nothing here is enforced by a server.

export const SETTINGS_SECTIONS = Object.freeze(['uploads', 'recycleBin', 'audit', 'backups', 'storage'])

// The eight audit-log categories of decision 31.
export const AUDIT_CATEGORIES = Object.freeze([
  'approval',
  'approvedEdits',
  'employeeAccounts',
  'restore',
  'backups',
  'authentication',
  'uploads',
  'processing',
])

export const BACKUP_FREQUENCY = Object.freeze({ daily: 'daily', weekly: 'weekly' })
export const BACKUP_RETENTION_MODE = Object.freeze({ count: 'count', days: 'days' })

// PROVISIONAL defaults (see the note at the top).
export const DEFAULT_SETTINGS = Object.freeze({
  uploads: Object.freeze({ maxFileSizeMb: 10, maxSelectedPages: 100 }),
  recycleBin: Object.freeze({ autoDelete: true, retentionDays: 30 }),
  audit: Object.freeze({
    categories: Object.freeze(Object.fromEntries(AUDIT_CATEGORIES.map((category) => [category, true]))),
    retentionDays: 90,
  }),
  backups: Object.freeze({
    scheduleEnabled: true,
    frequency: BACKUP_FREQUENCY.daily,
    time: '02:00',
    weekday: 5, // Friday (0 = Sunday), used by the weekly frequency
    retentionMode: BACKUP_RETENTION_MODE.count,
    retentionCount: 7,
    retentionDays: 30,
    localPath: '',
    externalPath: '',
  }),
  storage: Object.freeze({ warningPercent: 80, criticalPercent: 90 }),
})

// PROVISIONAL allowed ranges.
export const SETTINGS_LIMITS = Object.freeze({
  maxFileSizeMb: Object.freeze({ min: 1, max: 1024 }),
  maxSelectedPages: Object.freeze({ min: 1, max: 10000 }),
  retentionDays: Object.freeze({ min: 1, max: 3650 }),
  retentionCount: Object.freeze({ min: 1, max: 365 }),
  percent: Object.freeze({ min: 1, max: 99 }),
  pathMaxLength: 260,
})

export const VALIDATION = Object.freeze({
  required: 'required',
  notInteger: 'notInteger',
  outOfRange: 'outOfRange',
  invalidTime: 'invalidTime',
  tooLong: 'tooLong',
  mustBeBelowCritical: 'mustBeBelowCritical',
  mustDiffer: 'mustDiffer',
})

export function cloneSettings(settings = DEFAULT_SETTINGS) {
  return JSON.parse(JSON.stringify(settings))
}

// A copy of `stored` in which every missing or wrongly typed value falls back to the default
// (a settings object saved by an older version never breaks a screen).
export function normalizeSettings(stored) {
  const base = cloneSettings()
  for (const section of SETTINGS_SECTIONS) {
    const incoming = stored?.[section]
    if (!incoming || typeof incoming !== 'object') continue
    for (const key of Object.keys(base[section])) {
      if (key === 'categories') {
        for (const category of AUDIT_CATEGORIES) {
          if (typeof incoming.categories?.[category] === 'boolean') base.audit.categories[category] = incoming.categories[category]
        }
      } else if (typeof incoming[key] === typeof base[section][key]) base[section][key] = incoming[key]
    }
  }
  return base
}

function integerIn(value, { min, max }) {
  const text = String(value ?? '').trim()
  if (text === '') return VALIDATION.required
  if (!/^-?\d+$/.test(text)) return VALIDATION.notInteger
  const number = Number(text)
  return number < min || number > max ? VALIDATION.outOfRange : null
}

// Validates one section's values. Returns { field: code } (empty when valid). Numbers may
// arrive as text from form inputs.
export function validateSettingsSection(section, values) {
  const errors = {}
  const check = (field, code) => {
    if (code) errors[field] = code
  }
  if (section === 'uploads') {
    check('maxFileSizeMb', integerIn(values.maxFileSizeMb, SETTINGS_LIMITS.maxFileSizeMb))
    check('maxSelectedPages', integerIn(values.maxSelectedPages, SETTINGS_LIMITS.maxSelectedPages))
  } else if (section === 'recycleBin') {
    if (values.autoDelete) check('retentionDays', integerIn(values.retentionDays, SETTINGS_LIMITS.retentionDays))
  } else if (section === 'audit') {
    check('retentionDays', integerIn(values.retentionDays, SETTINGS_LIMITS.retentionDays))
  } else if (section === 'backups') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(values.time ?? ''))) errors.time = VALIDATION.invalidTime
    if (values.retentionMode === BACKUP_RETENTION_MODE.days) check('retentionDays', integerIn(values.retentionDays, SETTINGS_LIMITS.retentionDays))
    else check('retentionCount', integerIn(values.retentionCount, SETTINGS_LIMITS.retentionCount))
    for (const field of ['localPath', 'externalPath']) {
      if (String(values[field] ?? '').length > SETTINGS_LIMITS.pathMaxLength) errors[field] = VALIDATION.tooLong
    }
    const local = String(values.localPath ?? '').trim()
    const external = String(values.externalPath ?? '').trim()
    if (!errors.externalPath && local !== '' && local === external) errors.externalPath = VALIDATION.mustDiffer
  } else if (section === 'storage') {
    check('warningPercent', integerIn(values.warningPercent, SETTINGS_LIMITS.percent))
    check('criticalPercent', integerIn(values.criticalPercent, SETTINGS_LIMITS.percent))
    if (!errors.warningPercent && !errors.criticalPercent && Number(values.warningPercent) >= Number(values.criticalPercent)) {
      errors.warningPercent = VALIDATION.mustBeBelowCritical
    }
  }
  return errors
}

// Converts form values (numbers possibly as text) to the stored types for `section`.
export function coerceSection(section, values) {
  const numeric = { uploads: ['maxFileSizeMb', 'maxSelectedPages'], recycleBin: ['retentionDays'], audit: ['retentionDays'], backups: ['weekday', 'retentionCount', 'retentionDays'], storage: ['warningPercent', 'criticalPercent'] }
  const result = { ...values }
  for (const field of numeric[section] ?? []) result[field] = Number(result[field])
  if (section === 'backups') {
    result.localPath = String(result.localPath ?? '').trim()
    result.externalPath = String(result.externalPath ?? '').trim()
  }
  return result
}

// The part of the settings every signed-in user may read (the limits that decide whether a
// file or a page selection is accepted). Nothing else is exposed to employees.
export function getEmployeeLimits(settings) {
  return { maxFileSizeMb: settings.uploads.maxFileSizeMb, maxSelectedPages: settings.uploads.maxSelectedPages }
}
