export const contacts: Record<string, string> = {
  angel: '+549XXXXXXXXXX',
}

export function findContact(name: string): string {
  const key = String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  for (const [k, v] of Object.entries(contacts)) {
    const kk = k
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
    if (kk === key) return v
  }
  return ''
}
