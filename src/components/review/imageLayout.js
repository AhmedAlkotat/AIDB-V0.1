// Layout of a ROTATED image in the original viewer (display only, the file is
// never changed). A CSS rotation does not change an element's layout box, so a
// sideways image used to overflow its box (clipped at the top/start, unreachable
// by scrolling). Instead the viewer reserves the box of the ROTATED picture and
// centres the unrotated image inside it.
//
// `fitWidth` is the width the rotated picture should have at 100% zoom (the same
// "fit to width" the PDF pages use); `zoom` multiplies it.
//
// Returns { imageWidth, imageHeight, boxWidth, boxHeight } in CSS pixels:
// - imageWidth/imageHeight: the size of the <img> BEFORE rotation;
// - boxWidth/boxHeight: the size of the rotated picture (what the layout reserves).
export function getImageLayout({ naturalWidth, naturalHeight, fitWidth, zoom, rotation }) {
  const sideways = Math.abs(rotation) % 180 === 90
  const ratio = naturalHeight / naturalWidth // height per unit of width
  const boxWidth = Math.max(0, fitWidth * zoom)
  const boxHeight = sideways ? boxWidth / ratio : boxWidth * ratio
  return sideways
    ? { imageWidth: boxHeight, imageHeight: boxWidth, boxWidth, boxHeight }
    : { imageWidth: boxWidth, imageHeight: boxHeight, boxWidth, boxHeight }
}
