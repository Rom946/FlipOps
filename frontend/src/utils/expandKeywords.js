export function expandKeywords(keyword, userVariants = []) {
  const match = userVariants.find(
    v => v.trigger.toLowerCase() === keyword.toLowerCase() && v.enabled
  )
  if (match) return match.variants
  return [keyword, keyword + ' segunda mano', keyword + ' buen estado', keyword + ' ocasión']
}
