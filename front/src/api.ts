import { ChatMessage, ChatResponse } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'compa_token'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) return false
  const data = await res.json()
  if (data.token) setToken(data.token)
  return true
}

function headers(): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

export async function sendChat(messages: ChatMessage[]): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('unauthorized')
    throw new Error('Error del servidor: ' + res.status)
  }
  return res.json()
}

export async function resolveYoutube(query: string): Promise<{ id: string | null; url: string | null; title: string }> {
  const res = await fetch(`${API_URL}/api/youtube/search?q=${encodeURIComponent(query)}`, {
    headers: headers(),
  })
  if (!res.ok) return { id: null, url: null, title: '' }
  const data = await res.json()
  return { id: data.id ?? null, url: data.url ?? null, title: data.title ?? '' }
}

export async function sendDevice(action: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/device`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action }),
  })
  const data = await res.json()
  return data.ok ?? false
}
