export const DEFAULT_TIMEZONE = 'Asia/Dhaka'

export const CURRENCIES = [
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
]

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DEFAULT_WEEK_START = 6 // Saturday

export function currencyByCode(code) {
  return CURRENCIES.find((c) => c.code === code)
}

export function timezoneOptions() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return zones.includes(DEFAULT_TIMEZONE) ? zones : [DEFAULT_TIMEZONE, ...zones]
}

// The browser's timezone when it is a known IANA zone, otherwise Asia/Dhaka.
export function defaultTimezone(zones = timezoneOptions()) {
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone
  return zones.includes(browser) ? browser : DEFAULT_TIMEZONE
}

export function defaultOrgName(firstName) {
  const name = firstName?.trim()
  return name ? `${name}'s Organization` : 'My Organization'
}
