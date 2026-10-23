export function boundText(text: string, limit: number): string {
  const characters = Array.from(text)
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : text
}
