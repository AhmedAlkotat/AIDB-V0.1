// Runs every browser check one after the other (needs the dev server and Chrome/Edge):
//
//   npm run dev -- --port 5199        (terminal 1)
//   npm run check:browser             (terminal 2)
//
// The exit code is non-zero when any check fails. BASE_URL / CHROME_PATH are honoured.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = ['layout.check.mjs', 'image-rotation.check.mjs', 'review.check.mjs', 'navigation.check.mjs', 'integration.check.mjs', 'uat.check.mjs', 'auth.check.mjs', 'employees.check.mjs', 'admin.check.mjs', 'documents.check.mjs', 'documents-admin.check.mjs']
let failed = 0
for (const script of scripts) {
  const result = spawnSync(process.execPath, [join(here, script)], { stdio: 'inherit' })
  if (result.status !== 0) failed += 1
}
console.log(failed === 0 ? '\nAll browser check scripts passed.' : `\n${failed} browser check script(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
