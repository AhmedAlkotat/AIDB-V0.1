import { useTranslation } from '../../hooks/useTranslation.js'
import { getPdfViewerUrl } from '../../utils/documentFile.js'
import { Icon } from '../common/Icon.jsx'
import { PreviewMessage } from './PreviewMessage.jsx'

// Native browser PDF viewer. Where no inline viewer exists (many mobile
// browsers), the <object> fallback content is shown instead.
export function PdfViewer({ url, title }) {
  const { t } = useTranslation()
  const viewerUrl = getPdfViewerUrl(url)

  return (
    <div className="preview__frame has-file pdf-viewer__frame">
      <object className="preview__pdf" data={viewerUrl} type="application/pdf" aria-label={title}>
        <PreviewMessage
          icon="fileText"
          title={t('upload.preview.unavailableTitle')}
          text={t('upload.preview.pdfUnavailableText')}
        >
          <a className="button button--secondary" href={viewerUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="externalLink" />
            {t('upload.preview.openInNewTab')}
          </a>
        </PreviewMessage>
      </object>
    </div>
  )
}
