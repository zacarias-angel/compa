import { ChatMessage, ChatResponse } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? ''

export async function sendChat(messages: ChatMessage[]): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) {
    throw new Error('Error del servidor: ' + res.status)
  }
  return res.json()
}

export async function resolveYoutube(query: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/youtube/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.url ?? null
}
