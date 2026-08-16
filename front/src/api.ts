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

export async function resolveYoutube(query: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/youtube/search?q=${encodeURIComponent(query)}`, {
    headers: headers(),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.url ?? null
}

export async function sendWhatsApp(contacto: string, mensaje: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/wa/send`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ contacto, mensaje }),
  })
  const data = await res.json()
  return { ok: data.ok ?? false, error: data.error }
}

export async function getWaStatus(): Promise<{ connected: boolean; contactCount?: number }> {
  const res = await fetch(`${API_URL}/api/wa/status`, { headers: headers() })
  if (!res.ok) return { connected: false }
  return res.json()
}

export async function getWaQr(): Promise<{ connected: boolean; qr: string | null }> {
  const res = await fetch(`${API_URL}/api/wa/qr`, { headers: headers() })
  if (!res.ok) return { connected: false, qr: null }
  return res.json()
}
