import { useEffect, useRef, useState } from 'react'
import { Bot, LogOut, Maximize, Minimize, Send, X } from 'lucide-react'
import { ChatMessage, ChatResponse, Action } from './types'
import { getToken, getWaQr, getWaStatus, login, requestPairingCode, resolveYoutube, sendChat, sendWhatsApp, setToken } from './api'

interface Pending {
  texto: string
  accion: Action
}

async function executeAction(accion: Action): Promise<string | null> {
  const p = accion.parametros
  switch (accion.tipo) {
    case 'youtube': {
      const url = await resolveYoutube(p.busqueda || '')
      window.open(
        url ?? `https://www.youtube.com/results?search_query=${encodeURIComponent(p.busqueda || '')}`,
        '_self',
      )
      return null
    }
    case 'whatsapp': {
      const res = await sendWhatsApp(p.contacto || '', p.mensaje || '')
      if (res.ok) {
        return `Mensaje enviado a ${p.contacto}.`
      }
      return `No pude enviar el mensaje: ${res.error || 'error desconocido'}`
    }
    case 'email':
      window.open(
        `mailto:${p.destinatario || ''}?subject=${encodeURIComponent(p.asunto || '')}&body=${encodeURIComponent(p.cuerpo || '')}`,
        '_self',
      )
      return null
    default:
      return null
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
  const [waConnected, setWaConnected] = useState(true)
  const [waQr, setWaQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [waPhone, setWaPhone] = useState('')
  const [waCode, setWaCode] = useState<string | null>(null)
  const [waPairError, setWaPairError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, authed])

  useEffect(() => {
    if (!authed) return
    let cancelled = false
    async function poll() {
      const status = await getWaStatus()
      if (cancelled) return
      setWaConnected(status.connected)
      if (!status.connected) {
        const qr = await getWaQr()
        if (!cancelled) setWaQr(qr.qr)
      } else {
        setWaQr(null)
        setShowQr(false)
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [authed])

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

  async function runAction(accion: Action) {
    const result = await executeAction(accion)
    if (result) {
      setMessages((prev) => [...prev, { role: 'assistant', content: result }])
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
          await runAction(res.accion)
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

  async function handlePairingCode() {
    setWaPairError('')
    setWaCode(null)
    const res = await requestPairingCode(waPhone)
    if (res.ok && res.code) {
      setWaCode(res.code)
    } else if (res.connected) {
      setWaConnected(true)
    } else {
      setWaPairError(res.error || 'No pude generar el código')
    }
  }

  function confirmPending() {
    if (pending) {
      runAction(pending.accion)
    }
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
          onClick={() => setShowQr(true)}
          className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition hover:bg-white/10"
          aria-label="Estado WhatsApp"
        >
          <span className={`h-2 w-2 rounded-full ${waConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span className={waConnected ? 'text-emerald-400' : 'text-amber-400'}>
            {waConnected ? 'WA' : 'WA!'}
          </span>
        </button>
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
      {showQr && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-5 text-white shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-lg font-semibold">Vincular WhatsApp</span>
              <button onClick={() => setShowQr(false)} aria-label="Cerrar">
                <X className="h-6 w-6 text-white/60" />
              </button>
            </div>
            {waConnected ? (
              <p className="text-[15px] text-emerald-400">WhatsApp conectado.</p>
            ) : waQr ? (
              <>
                <p className="mb-3 text-sm text-white/70">
                  Escaneá el QR desde OTRO teléfono (WhatsApp → Ajustes → Dispositivos vinculados →
                  Vincular dispositivo).
                </p>
                <img src={waQr} alt="QR WhatsApp" className="mx-auto w-full max-w-[240px] rounded-xl bg-white p-2" />
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/20" />
                  <span className="text-xs text-white/50">o usá código</span>
                  <div className="h-px flex-1 bg-white/20" />
                </div>
              </>
            ) : (
              <p className="text-[15px] text-white/70">
                Generando QR... si no aparece, usá el código de vinculación de abajo.
              </p>
            )}

            {!waConnected && (
              <div className="space-y-2">
                <p className="text-xs text-white/60">
                  Vinculación por código (sin escanear): poné tu número con código de país y te doy
                  un código de 8 dígitos. Después en WhatsApp: Ajustes → Dispositivos vinculados →
                  Vincular con número de teléfono.
                </p>
                <div className="flex gap-2">
                  <input
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value)}
                    placeholder="+54 11 3614 0214"
                    className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
                  />
                  <button
                    onClick={handlePairingCode}
                    className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500"
                  >
                    Código
                  </button>
                </div>
                {waPairError && <p className="text-sm text-red-400">{waPairError}</p>}
                {waCode && (
                  <p className="rounded-lg bg-emerald-900/50 px-3 py-2 text-center text-2xl font-bold tracking-widest text-emerald-300">
                    {waCode}
                  </p>
                )}
              </div>
            )}
            <div className="mt-5">
              <button
                onClick={() => setShowQr(false)}
                className="w-full rounded-xl bg-white/10 py-3 text-[15px] font-medium hover:bg-white/20"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
