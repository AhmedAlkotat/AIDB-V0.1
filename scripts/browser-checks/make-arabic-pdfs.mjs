// Creates REAL Arabic PDF documents for the browser checks (UAT-02), without any
// dependency: Chrome's own "print to PDF" lays out real, shaped Arabic text and embeds the
// fonts, like a document exported from a word processor. (The demo PDF of the app is
// English only and cannot show Arabic rendering problems.)
//
//   import { makeArabicPdfs } from './make-arabic-pdfs.mjs'
//   const files = await makeArabicPdfs()   // [{ name, path }]
//
// One PDF per installed font family that can show Arabic; each has 2 pages: headings,
// long paragraphs with diacritics and Arabic-Indic digits, a table, mixed Latin text.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean).find((path) => existsSync(path))

const FONTS = ['Arial', 'Segoe UI', 'Sakkal Majalla', 'Arabic Typesetting', 'Times New Roman']

const html = (font, pageSize = 'A4') => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
  @page { size: ${pageSize}; margin: 20mm }
  body { font-family: '${font}', sans-serif; font-size: 16pt; line-height: 1.9 }
  h1 { font-size: 26pt; text-align: center }
  table { border-collapse: collapse; width: 100% } td, th { border: 1px solid #333; padding: 6px }
  .break { break-before: page }
</style></head><body>
<h1>الجمهورية العربية — وزارة التعليم العالي</h1>
<p>بسم الله الرحمن الرحيم. نشهد نحن الموقعين أدناه بأن الطالب «محمد أحمد عبد الله» قد أتمّ دراسته في كلية الهندسة بتاريخ ٢٠٢٦/٠٥/١٢ وحصل على تقدير جيد جدًا.</p>
<p>الكتاب مفتوح على المكتب، والمدرسة مغلقة، ومسؤول القسم غائب؛ مُحَمَّدٌ يَقْرَأُ الْقُرْآنَ في المَسْجِدِ. الرقم: ١٢٣٤٥٦٧٨٩٠ والمبلغ 1,250.75 ريال.</p>
<table><tr><th>الاسم</th><th>المادة</th><th>الدرجة</th></tr>
<tr><td>فاطمة علي</td><td>الرياضيات</td><td>٩٢</td></tr>
<tr><td>يوسف حسن</td><td>الفيزياء</td><td>٨٨</td></tr></table>
<p class="break">الصفحة الثانية: نص مختلط Arabic and English together، مع رقم الهاتف +967 777 123 456 والبريد info@example.org.</p>
<p>وقال الشاعر: «إذا الشعبُ يومًا أراد الحياةَ فلا بدَّ أن يستجيبَ القدر».</p>
</body></html>`

// One Arabic PDF; `pageSize` is any CSS @page size (e.g. 'A4', 'A4 landscape', 'Letter').
export function makeArabicPdf({ font = 'Arial', pageSize = 'A4', outDir = join(tmpdir(), 'aidp-browser-checks', 'arabic'), label = '' } = {}) {
  if (!CHROME) throw new Error('No Chrome/Edge found. Set CHROME_PATH.')
  mkdirSync(outDir, { recursive: true })
  const slug = `${font.toLowerCase().replace(/[^a-z]+/g, '-')}${label}`
  const htmlPath = join(outDir, `${slug}.html`)
  const pdfPath = join(outDir, `arabic-${slug}.pdf`)
  writeFileSync(htmlPath, html(font, pageSize), 'utf-8')
  const result = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file:///${htmlPath.split('\\').join('/')}`], { stdio: 'ignore', timeout: 60000 })
  if (result.status !== 0 || !existsSync(pdfPath)) throw new Error(`Could not create ${pdfPath}`)
  return { name: font, path: pdfPath }
}

export async function makeArabicPdfs(outDir = join(tmpdir(), 'aidp-browser-checks', 'arabic')) {
  const files = []
  for (const font of FONTS) {
    files.push(makeArabicPdf({ font, outDir }))
  }
  return files
}

if (process.argv[1] && process.argv[1].endsWith('make-arabic-pdfs.mjs')) {
  const files = await makeArabicPdfs()
  for (const file of files) console.log(`${file.name}: ${file.path}`)
}
