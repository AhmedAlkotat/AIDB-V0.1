import { useEffect, useState, useSyncExternalStore } from 'react'
import { employeeService } from '../services/employeeService.js'
import { createEmployeeDirectory } from '../state/employees/employeeDirectory.js'

// The employee list and its actions for an Admin screen (see state/employees/employeeDirectory.js).
// Loads the list when the screen opens. `service` can be replaced (tests).
export function useEmployeeDirectory(service = employeeService) {
  const [directory] = useState(() => createEmployeeDirectory(service))
  const state = useSyncExternalStore(directory.subscribe, directory.getState, directory.getState)

  useEffect(() => {
    directory.load()
  }, [directory])

  return { ...state, reload: directory.load, create: directory.create, update: directory.update, setPassword: directory.setPassword, deactivate: directory.deactivate, reactivate: directory.reactivate }
}
