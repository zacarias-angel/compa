import { useEffect, useRef, useState } from 'react'
import { Bot, LogOut, Maximize, Minimize, Send, X } from 'lucide-react'
import { ChatMessage, ChatResponse, Action } from './types'
import { getToken, login, resolveYoutube, sendChat, setToken } from './api'
import { findContact } from './contacts'

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
      const num = findContact(p.contacto || '').replace(/\D/g, '')
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
  const [authed, setAuthed] = useState(() => !!getToken())
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [kiosk, setKiosk] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, authed])

  useEffect(() => {
    let lock: any = null
    if (kiosk) {
      document.documentElement.requestFullscreen?.().catch(() => {})
      ;(navigator as any).wakeLock
        ?.request('screen')
        .then((l: any) => {
          lock = l
        })
        .catch(() => {})
    }
    return () => {
      lock?.release?.()
    }
  }, [kiosk])

  async function handleLogin() {
    setLoginError(false)
    const ok = await login(password)
    if (ok) {
      setAuthed(true)
    } else {
      setLoginError(true)
    }
  }

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
      const skip = ['luz_on', 'luz_off', 'musica_on', 'musica_off']
      if (res.accion && !skip.includes(res.accion.tipo)) {
        if (res.requiere_confirmacion) {
          setPending({ texto: res.texto, accion: res.accion })
        } else {
          await executeAction(res.accion)
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'unauthorized') {
        setToken('')
        setAuthed(false)
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Hubo un error. Verificá que el backend esté corriendo.' }])
      }
    } finally {
      setLoading(false)
    }
  }

  function confirmPending() {
    if (pending) executeAction(pending.accion)
    setPending(null)
  }

  if (!authed) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0b0f1a] px-6">
        <div className="w-full max-w-xs">
          <div className="mb-6 flex flex-col items-center gap-3">
            <Bot className="h-12 w-12 text-sky-400" />
            <h1 className="text-xl font-bold text-white">Compa</h1>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Contraseña"
            className="w-full rounded-xl bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/40"
          />
          {loginError && <p className="mt-2 text-sm text-red-400">Contraseña incorrecta</p>}
          <button
            onClick={handleLogin}
            className="mt-4 w-full rounded-xl bg-sky-600 py-3 font-semibold text-white transition hover:bg-sky-500"
          >
            Entrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0f1a]">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="font-semibold leading-tight text-white">Compa</div>
          <div className="text-xs text-emerald-400">en línea</div>
        </div>
        <button
          onClick={() => setKiosk((k) => !k)}
          className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Kiosko"
        >
          {kiosk ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </button>
        <button
          onClick={() => {
            setToken('')
            setAuthed(false)
          }}
          className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Salir"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mt-16 text-center">
            <Bot className="mx-auto mb-4 h-12 w-12 text-white/20" />
            <p className="text-base text-white/50">
              Decime &quot;eh compa, reproducí una canción&quot; o
              <br />
              &quot;mandale un mensaje a angel&quot;.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                m.role === 'user' ? 'bg-sky-600 text-white' : 'bg-white/10 text-white'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white/10 px-4 py-2.5 text-[15px] text-white/60">
              <span className="inline-block animate-pulse">Escribiendo...</span>
            </div>
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
          className="flex-1 rounded-full bg-white/10 px-4 py-3 text-[15px] text-white outline-none placeholder:text-white/40"
        />
        <button
          onClick={() => handleSend()}
          className="rounded-full bg-sky-600 p-3 text-white transition hover:bg-sky-500"
          aria-label="Enviar"
        >
          <Send className="h-5 w-5" />
        </button>
      </footer>

      {pending && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-5 text-white shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-lg font-semibold">Confirmar</span>
              <button onClick={() => setPending(null)} aria-label="Cerrar">
                <X className="h-6 w-6 text-white/60" />
              </button>
            </div>
            <p className="text-[15px] leading-relaxed text-white/85">{pending.texto}</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setPending(null)}
                className="flex-1 rounded-xl bg-white/10 py-3 text-[15px] font-medium hover:bg-white/20"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPending}
                className="flex-1 rounded-xl bg-sky-600 py-3 text-[15px] font-medium hover:bg-sky-500"
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
