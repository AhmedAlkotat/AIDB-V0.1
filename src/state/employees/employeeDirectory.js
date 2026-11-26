// The Admin's view of the employee accounts: the loaded list plus the actions on it.
// Independent of React (so it can be tested without a browser); useEmployeeDirectory
// connects it to the component tree.
//
// state: { status: 'idle' | 'loading' | 'ready' | 'error', items, error }
//   `error` is an EMPLOYEE_ERROR code when the list could not be loaded.
//
// Every action resolves to { ok: true, employee? } or { ok: false, error: { code, fields } }
// and never throws, so a screen shows the result in the dialog that started it. A change is
// applied to the list only after the service acknowledged it.

import { EMPLOYEE_ERROR, EmployeeError } from '../../services/employeeErrors.js'

function toFailure(error) {
  if (error instanceof EmployeeError) return { ok: false, error: { code: error.code, fields: error.fields } }
  return { ok: false, error: { code: EMPLOYEE_ERROR.unknown, fields: {} } }
}

export function createEmployeeDirectory(service) {
  let state = { status: 'idle', items: [], error: null }
  let epoch = 0
  const listeners = new Set()

  function setState(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  const replace = (employee) => setState({ items: state.items.map((item) => (item.id === employee.id ? employee : item)) })

  async function act(operation, apply) {
    try {
      const result = await operation()
      apply?.(result)
      return { ok: true, employee: result ?? undefined }
    } catch (error) {
      return toFailure(error)
    }
  }

  const directory = {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // (Re)loads the list. A newer call wins over an older one still in flight.
    async load() {
      const mine = ++epoch
      setState({ status: 'loading', error: null })
      try {
        const items = await service.listEmployees()
        if (mine !== epoch) return
        setState({ status: 'ready', items })
      } catch (error) {
        if (mine !== epoch) return
        setState({ status: 'error', error: error instanceof EmployeeError ? error.code : EMPLOYEE_ERROR.unknown })
      }
    },

    create: (input) => act(() => service.createEmployee(input), (employee) => setState({ items: [...state.items, employee] })),
    update: (id, input) => act(() => service.updateEmployee(id, input), replace),
    deactivate: (id) => act(() => service.deactivateEmployee(id), replace),
    reactivate: (id) => act(() => service.reactivateEmployee(id), replace),
    // The password is sent and forgotten: nothing about it is kept or returned.
    setPassword: (id, password) => act(async () => service.setEmployeePassword(id, password).then(() => undefined)),
  }
  return directory
}
