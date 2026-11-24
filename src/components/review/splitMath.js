// Sizes of the two panels of the review split view (pure, so the rules can be tested).
//
// `ratio` is the share of the USABLE width (container minus the divider) that goes to the
// first panel. The panels are laid out as `minmax(0, ratio fr) divider minmax(0, (1 - ratio) fr)`:
// flex factors that add up to exactly 1 and no pixel minimums in the CSS, so together the two
// panels always fill the usable width. The minimum widths are enforced here, by clamping the
// ratio. (Pixel minimums inside the grid tracks leave the other track with a flex sum below 1
// once one track is held at its minimum, and CSS Grid then hands it only that fraction of the
// free space: up to ~250px stayed empty at the drag extremes.)

export const DIVIDER_PX = 14

export function getUsableWidth(containerWidth, dividerPx = DIVIDER_PX) {
  return (containerWidth || 0) - dividerPx
}

// The closest ratio that keeps both panels at least their minimum width.
export function clampSplitRatio(value, containerWidth, { minStartPx, minEndPx, dividerPx = DIVIDER_PX }) {
  const usable = getUsableWidth(containerWidth, dividerPx)
  if (usable <= 0) return value
  const min = minStartPx / usable
  const max = 1 - minEndPx / usable
  return min > max ? 0.5 : Math.min(max, Math.max(min, value))
}

// The ratio that puts the divider's centre at `distanceFromStart` px from the container's inline start.
export function ratioFromDistance(distanceFromStart, containerWidth, dividerPx = DIVIDER_PX) {
  return (distanceFromStart - dividerPx / 2) / getUsableWidth(containerWidth, dividerPx)
}

// The pixel widths the grid gives the two panels for a ratio.
export function getPanelWidths(ratio, containerWidth, dividerPx = DIVIDER_PX) {
  const usable = getUsableWidth(containerWidth, dividerPx)
  return { start: usable * ratio, end: usable * (1 - ratio) }
}
