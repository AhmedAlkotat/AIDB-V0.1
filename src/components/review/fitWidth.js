// The width the original page is fitted to in the viewer (pure, so the rule can be tested).
//
// The page is scaled to fit the viewer frame's width. The frame scrolls, so a vertical
// scrollbar may or may not be showing, and it takes `scrollbarWidth` px from the content
// width when it shows. If the fit width were measured from the content width, it would depend
// on the scrollbar, and the scrollbar depends on the page height, which depends on the fit
// width: whenever a page's height was close to the frame's height (an A4 page turned 90
// degrees is the common case) the two chased each other and the canvas flickered between two
// sizes for ever. So the width is taken from the BORDER box and ONE scrollbar is always
// subtracted, whether it is showing or not.

export function getFitContainerWidth({ borderBoxWidth, borderWidth = 0, scrollbarWidth = 0 }) {
  return Math.max(0, Math.floor(borderBoxWidth - borderWidth - scrollbarWidth))
}

// Height of a page (plus the viewer's padding) for a fit width: what decides whether the frame
// needs a vertical scrollbar. `pageRatio` is page height / page width as displayed (after rotation).
export function getPageBoxHeight({ fitWidth, pageRatio, padding = 32 }) {
  return (fitWidth - padding) * pageRatio + padding
}
