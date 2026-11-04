// Database errors from folders/files/categories → messages for the user.
export function structureErrorMessage(error, thing = 'item') {
  if (!error) return null
  if (error.code === '23505') return `A ${thing} with this name already exists.`
  if (error.code === '23503') {
    if (thing === 'category') return 'This category still has entries, so it can\'t be deleted. Archive it instead.'
    return 'Something it depends on no longer exists. Reload the page and try again.'
  }
  if (error.code === '23514' && /type of a category/.test(error.message ?? '')) {
    return 'This category already has entries, so its type can\'t be changed.'
  }
  if (error.code === '42501' && /cannot see/.test(error.message ?? '')) return error.message
  if (error.code === '42501') return 'You don\'t have permission to do that.'
  return error.message ?? 'Something went wrong. Please try again.'
}

// An update or delete that RLS filtered out returns no error and no rows.
export const NO_ROWS_MESSAGE = 'It may have been deleted, or you no longer have permission. Reload the page and try again.'

// Throws a user-facing Error for a failed write, or for an update/delete (with .select()) that changed nothing.
export async function checkWrite(promise, thing) {
  const { data, error } = await promise
  if (error) throw new Error(structureErrorMessage(error, thing))
  if (Array.isArray(data) && data.length === 0) throw new Error(NO_ROWS_MESSAGE)
  return data
}
