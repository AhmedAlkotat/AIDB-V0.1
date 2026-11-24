// DEMO DATA ONLY: builds a small, real, valid multi-page PDF in memory so the
// review page can show an actual PDF without any uploaded file. Latin text
// only (standard Helvetica); the pages show a frame and a diagonal so zoom,
// pan and rotation are visible.

export function createDemoPdfBytes(pageCount, title = 'AIDP DEMO DOCUMENT') {
  const objects = []
  const kids = Array.from({ length: pageCount }, (_, index) => `${4 + index * 2} 0 R`).join(' ')
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  for (let index = 0; index < pageCount; index += 1) {
    const pageObject = 4 + index * 2
    const stream = [
      `BT /F1 26 Tf 60 740 Td (${title}) Tj ET`,
      `BT /F1 18 Tf 60 700 Td (Page ${index + 1} of ${pageCount}) Tj ET`,
      'BT /F1 12 Tf 60 670 Td (Mock page for the review screen - not a real document) Tj ET',
      '60 60 475 600 re S',
      '60 60 m 535 660 l S',
      '0.85 0.93 0.93 rg 80 400 200 120 re f',
    ].join('\n')
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObject + 1} 0 R >>`,
    )
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }

  let body = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefAt = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`

  const bytes = new Uint8Array(body.length)
  for (let index = 0; index < body.length; index += 1) bytes[index] = body.charCodeAt(index) & 0xff
  return bytes
}

export function createDemoPdfFile(pageCount, fileName, title) {
  return new File([createDemoPdfBytes(pageCount, title)], fileName, { type: 'application/pdf' })
}
