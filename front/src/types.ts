export interface Action {
  tipo: string
  parametros: Record<string, string>
}

export interface ChatResponse {
  texto: string
  accion: Action | null
  requiere_confirmacion: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
