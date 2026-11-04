// Database errors from folders/files/categories → messages for the user.
export function structureErrorMessage(error, thing = 'item') {
  if (!error) return null
  if (error.code === '23505') return `A ${thing} with this name already exists.`
  if (error.code === '23503') return 'This category still has entries, so it can\'t be deleted. Archive it instead.'
  if (error.code === '42501' && /cannot see/.test(error.message ?? '')) return error.message
  if (error.code === '42501') return 'You don\'t have permission to do that.'
  return error.message ?? 'Something went wrong. Please try again.'
}
