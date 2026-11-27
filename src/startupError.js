// A plain-DOM message for a build that cannot start (no framework, no translations, no styles: none of them are loaded
// yet). Arabic first, then English. It names the problem and the setting to fix; it never contains a secret.

export function showConfigurationError(error, root = globalThis.document?.getElementById('root')) {
  if (!root) return
  const box = globalThis.document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.cssText = 'max-width:640px;margin:48px auto;padding:24px;border:1px solid #c0392b;border-radius:8px;font-family:system-ui,sans-serif;line-height:1.6'
  const lines = [
    ['rtl', 'إعدادات بناء التطبيق غير صالحة، لذلك لم يبدأ التشغيل.'],
    ['ltr', 'The application build is misconfigured, so it did not start.'],
    ['ltr', `${error.code}: ${error.message}`],
  ]
  for (const [direction, text] of lines) {
    const paragraph = globalThis.document.createElement('p')
    paragraph.dir = direction
    paragraph.textContent = text
    box.appendChild(paragraph)
  }
  root.replaceChildren(box)
}
