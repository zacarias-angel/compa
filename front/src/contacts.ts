export const contacts: Record<string, string> = {
  angel: '+541136140214',
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function findContact(name: string): string {
  const key = normalize(name)
  for (const [k, v] of Object.entries(contacts)) {
    if (normalize(k) === key) return v
  }
  return ''
}
