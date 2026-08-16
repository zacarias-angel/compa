import { useEffect, useRef, useState } from 'react'
import { Bot, Send, X } from 'lucide-react'
import { ChatMessage, ChatResponse, Action } from './types'
import { resolveYoutube, sendChat } from './api'
import { contacts } from './contacts'

interface Pending {
  texto: string
  accion: Action
}

async function executeAction(accion: Action) {
  const p = accion.parametros
  switch (accion.tipo) {
    case 'youtube': {
      const url = await resolveYoutube(p.busqueda || '')
      window.open(
        url ?? `https://www.youtube.com/results?search_query=${encodeURIComponent(p.busqueda || '')}`,
        '_self',
      )
      break
    }
    case 'whatsapp': {
      const num = (contacts[p.contacto?.toLowerCase() || ''] || '').replace(/\D/g, '')
      const msg = encodeURIComponent(p.mensaje || '')
      if (num) {
        window.open(`https://wa.me/${num}?text=${msg}`, '_self')
      } else {
        window.open(`https://wa.me/?text=${msg}`, '_self')
      }
      break
    }
    case 'email':
      window.open(
        `mailto:${p.destinatario || ''}?subject=${encodeURIComponent(p.asunto || '')}&body=${encodeURIComponent(p.cuerpo || '')}`,
        '_self',
      )
      break
    default:
      break
  }
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    const next: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setLoading(true)
    try {
      const res: ChatResponse = await sendChat(next)
      const assistant: ChatMessage = { role: 'assistant', content: res.texto }
      setMessages((prev) => [...prev, assistant])
      if (res.accion && res.accion.tipo !== 'luz_on' && res.accion.tipo !== 'luz_off' && res.accion.tipo !== 'musica_on' && res.accion.tipo !== 'musica_off') {
        if (res.requiere_confirmacion) {
          setPending({ texto: res.texto, accion: res.accion })
        } else {
          await executeAction(res.accion)
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Hubo un error. Verificá que el backend esté corriendo.' }])
    } finally {
      setLoading(false)
    }
  }

  function confirmPending() {
    if (pending) {
      executeAction(pending.accion)
    }
    setPending(null)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Bot className="h-5 w-5 text-sky-400" />
        <span className="font-semibold text-white">Compa</span>
        <span className="ml-auto text-xs text-white/40">kiosko</span>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mt-10 text-center text-sm text-white/40">
            Decime qué querés hacer. Por ejemplo: &quot;reproducí x en youtube&quot; o
            &quot;mandale un mensaje a amor&quot;.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-sky-600 text-white' : 'bg-white/10 text-white'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/60">...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Escribí acá..."
          className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white outline-none placeholder:text-white/40"
        />
        <button
          onClick={() => handleSend()}
          className="rounded-full bg-sky-600 p-2 text-white transition hover:bg-sky-500"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </footer>

      {pending && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-5 text-white shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold">Confirmar</span>
              <button onClick={() => setPending(null)} aria-label="Cerrar">
                <X className="h-5 w-5 text-white/60" />
              </button>
            </div>
            <p className="text-sm text-white/80">{pending.texto}</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setPending(null)}
                className="flex-1 rounded-lg bg-white/10 py-2 text-sm hover:bg-white/20"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPending}
                className="flex-1 rounded-lg bg-sky-600 py-2 text-sm hover:bg-sky-500"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
