/** Half the proportion-bar height (h-3 = 12px) → fully rounded pill ends on the end segments. */
const BAR_RADIUS = 6

/**
 * Corner radii `[topLeft, topRight, bottomRight, bottomLeft]` for a horizontal stacked segment at
 * `index` of `count`: round the left end of the first segment and the right end of the last (both
 * ends when there's a single segment), leaving inner segments square so the row reads as one pill.
 *
 * Shared by the proportion bars ({@link SpendingByType}, {@link SpendingByCategory}) so their
 * containers don't need `overflow-hidden` for the pill shape — clipping there would also clip the
 * hover tooltip down to the bar's height, leaving a white sliver over the bar.
 */
export function cornerRadius(
  index: number,
  count: number
): [number, number, number, number] {
  const first = index === 0
  const last = index === count - 1
  return [
    first ? BAR_RADIUS : 0,
    last ? BAR_RADIUS : 0,
    last ? BAR_RADIUS : 0,
    first ? BAR_RADIUS : 0,
  ]
}
