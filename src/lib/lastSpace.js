// The last space the user opened, so "/" can go straight to its dashboard (SPEC.md §5.8).
// Per browser only; storage may be unavailable (private mode), which just means no shortcut.
const KEY = 'hisab-nikash.last-space'

export function rememberLastSpace(spaceId) {
  try {
    localStorage.setItem(KEY, spaceId)
  } catch {
    // ignore
  }
}

export function readLastSpace() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
