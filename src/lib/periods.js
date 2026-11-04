// Dashboard periods (SPEC.md §5.8). All dates are "YYYY-MM-DD" strings in the organization's
// timezone; the arithmetic is done in UTC so it never shifts a day.

export const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]

const toDate = (iso) => new Date(`${iso}T00:00:00Z`)
const toIso = (date) => date.toISOString().slice(0, 10)

export function addDays(iso, days) {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

// Days from `from` to `to`, counting both.
export function dayCount(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86_400_000) + 1
}

// { from, to } for a period. `weekStart` is 0 (Sunday) … 6 (Saturday). Periods run up to today.
export function periodRange(period, today, weekStart = 6, custom = {}) {
  switch (period) {
    case 'week': {
      const back = (toDate(today).getUTCDay() - weekStart + 7) % 7
      return { from: addDays(today, -back), to: today }
    }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
    case 'custom': {
      const from = custom.from || today
      const to = custom.to || today
      return from <= to ? { from, to } : { from: to, to: from }
    }
    default:
      return { from: today, to: today }
  }
}

// Trend bars: per day for a week or month, per month for a year; custom ranges pick the size
// that gives a readable number of bars.
export function trendBucket(period, from, to) {
  if (period === 'year') return 'month'
  if (period !== 'custom') return 'day'
  const days = dayCount(from, to)
  if (days <= 62) return 'day'
  if (days <= 26 * 7) return 'week'
  return 'month'
}

// Percentage change from `previous` to `current`, or null when there is nothing to compare with.
export function percentChange(current, previous) {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
