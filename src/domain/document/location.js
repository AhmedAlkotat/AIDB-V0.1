// Optional element coordinates (decision 50).
//
// A model MAY report where an element sits on the original page: `element.location` is null or
// { x, y, width, height }, each relative to the UNROTATED page from 0 to 1 (see validation.js).
// The review works without them; when they exist the element can be shown on the original page.

export const hasLocation = (element) => element?.location !== null && element?.location !== undefined

// The area as drawn when the page is displayed rotated clockwise by 0, 90, 180 or 270 degrees
// (the viewer's display-only rotation). Still relative (0..1) to the rotated page.
export function rotateLocation(location, rotation = 0) {
  const { x, y, width, height } = location
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: 1 - y - height, y: x, width: height, height: width }
    case 180:
      return { x: 1 - x - width, y: 1 - y - height, width, height }
    case 270:
      return { x: y, y: 1 - x - width, width: height, height: width }
    default:
      return { x, y, width, height }
  }
}

// CSS percentages for an absolutely positioned overlay inside the page box.
export function toPercentStyle(location) {
  const percent = (value) => `${Math.round(value * 10000) / 100}%`
  return { left: percent(location.x), top: percent(location.y), width: percent(location.width), height: percent(location.height) }
}
