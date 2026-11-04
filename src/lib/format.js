// Money in a space's currency, e.g. "৳1,250.00". Falls back to "<symbol>1,250.00" for codes
// Intl doesn't know.
export function formatMoney(amount, currencyCode, currencySymbol) {
  const value = Number(amount) || 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode, currencyDisplay: 'narrowSymbol' }).format(value)
  } catch {
    const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    return `${currencySymbol ?? ''}${number}`
  }
}
