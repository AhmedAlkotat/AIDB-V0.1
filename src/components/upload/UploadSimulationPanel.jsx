import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation.js'
import { DevSimulationPanel } from '../admin/DevSimulationPanel.jsx'

// DEVELOPMENT-ONLY switches of the simulated upload backend (the page renders this only when its workflow
// service exposes `dev`, which production services never do): make the next processed document fail, and
// pretend the disk cannot take the next upload (decision 35). The storage level itself is changed on the
// Admin's storage page.
export function UploadSimulationPanel({ dev }) {
  const { t } = useTranslation()
  const [failNext, setFailNext] = useState(dev.isFailNextDocument())
  const [noSpace, setNoSpace] = useState(dev.isInsufficientSpace())

  return (
    <DevSimulationPanel>
      <label className="mock-tools__toggle">
        <input
          type="checkbox"
          checked={failNext}
          onChange={(event) => {
            setFailNext(event.target.checked)
            dev.failNextDocument(event.target.checked)
          }}
        />
        {t('upload.dev.failNext')}
      </label>
      <label className="mock-tools__toggle">
        <input
          type="checkbox"
          checked={noSpace}
          onChange={(event) => {
            setNoSpace(event.target.checked)
            dev.setInsufficientSpace(event.target.checked)
          }}
        />
        {t('upload.dev.noSpace')}
      </label>
    </DevSimulationPanel>
  )
}
