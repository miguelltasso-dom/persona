/**
 * Move focus between sibling buttons without activating them (T3-UX-HARVEST §1; MIT pattern from t3code keyboard-focus).
 */

export function rovingVerticalKey(
  event: { key: string; preventDefault: () => void },
  index: number,
  length: number,
  focusAt: (nextIndex: number) => void,
): boolean {
  if (length <= 1) return false
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusAt((index + 1) % length)
    return true
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusAt((index - 1 + length) % length)
    return true
  }
  return false
}
