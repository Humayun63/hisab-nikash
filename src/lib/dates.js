// Dates are plain "YYYY-MM-DD" strings, like Postgres `date` (SPEC.md §10).

// Today in an IANA timezone, e.g. todayIn('Asia/Dhaka') → "2026-11-04".
export function todayIn(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  }
}

const displayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// "2026-11-04" → "4 Nov 2026" (in the user's locale). The date is read as UTC so it never shifts a day.
export function formatDate(isoDate) {
  if (!isoDate) return ''
  return displayFormat.format(new Date(`${isoDate}T00:00:00Z`))
}
