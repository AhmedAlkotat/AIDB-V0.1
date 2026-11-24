// Small helpers for plain JSON-compatible data (no dependencies).

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// True for data that survives JSON.stringify/parse unchanged: null, booleans,
// finite numbers, strings, arrays and plain objects (no cycles).
export function isJsonValue(value, ancestors = []) {
  if (value === null) return true
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true
    case 'number':
      return Number.isFinite(value)
    case 'object': {
      if (ancestors.includes(value)) return false
      const next = [...ancestors, value]
      if (Array.isArray(value)) return value.every((item) => isJsonValue(item, next))
      if (!isPlainObject(value)) return false
      return Object.values(value).every((item) => isJsonValue(item, next))
    }
    default:
      return false
  }
}

function setOwn(target, key, value) {
  // defineProperty so a "__proto__" key from parsed JSON stays plain data.
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
}

export function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone)
  if (isPlainObject(value)) {
    const copy = {}
    for (const [key, item] of Object.entries(value)) setOwn(copy, key, deepClone(item))
    return copy
  }
  return value
}

export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

export function deepEqual(a, b) {
  if (a === b) return true
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    return keysA.length === keysB.length && keysA.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
  }
  return false
}
