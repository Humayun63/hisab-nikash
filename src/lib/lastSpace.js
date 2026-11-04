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

// "/" only jumps to the last space on the first visit in a tab, so Home and "All spaces" still
// show the list afterwards. Cleared on sign-out.
const LANDED_KEY = 'hisab-nikash.landed'

export function takeLanding() {
  try {
    if (sessionStorage.getItem(LANDED_KEY)) return false
    sessionStorage.setItem(LANDED_KEY, '1')
    return true
  } catch {
    return false
  }
}

export function resetLanding() {
  try {
    sessionStorage.removeItem(LANDED_KEY)
  } catch {
    // ignore
  }
}
