import { useEffect, useRef, useState } from 'react'
import { Bot, LogOut, Maximize, Mic, MicOff, Minimize, Send, Volume2, VolumeX, X } from 'lucide-react'
import { ChatMessage, ChatResponse, Action } from './types'
import { getToken, login, resolveYoutube, sendChat, sendDevice, setToken } from './api'
import { findContact } from './contacts'
import { isSpeechSupported, isTtsSupported, listenForCommand, speak, startWakeWord, stopListening, stopSpeaking } from './voice'

interface Pending {
  texto: string
  accion: Action
}

interface VideoInfo {
  type: 'video'
  id: string
  title: string
}

type ActionResult = string | VideoInfo | null

async function executeAction(accion: Action): Promise<ActionResult> {
  const p = accion.parametros
  switch (accion.tipo) {
    case 'youtube': {
      const res = await resolveYoutube(p.busqueda || '')
      if (res.id) {
        return { type: 'video', id: res.id, title: res.title }
      }
      return 'No encontré el video.'
    }
    case 'whatsapp': {
      const num = findContact(p.contacto || '').replace(/\D/g, '')
      const msg = encodeURIComponent(p.mensaje || '')
      if (num) {
        window.open(`https://wa.me/${num}?text=${msg}`, '_self')
      } else {
        window.open(`https://wa.me/?text=${msg}`, '_self')
      }
      await sendDevice('tap')
      return `Listo, preparé el mensaje para ${p.contacto || 'tu contacto'}.`
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
  const [voiceOn, setVoiceOn] = useState(() => isSpeechSupported())
  const [ttsOn, setTtsOn] = useState(() => isTtsSupported())
  const [awaitingWake, setAwaitingWake] = useState(true)
  const [micBlocked, setMicBlocked] = useState(false)
  const [player, setPlayer] = useState<VideoInfo | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const ttsRef = useRef(ttsOn)
  ttsRef.current = ttsOn

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

  useEffect(() => {
    if (!authed || !voiceOn) {
      stopListening()
      return
    }
    startListeningForWake()
    return () => {
      stopListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, voiceOn])

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
    if (!result) return
    if (typeof result === 'object' && 'type' in result && result.type === 'video') {
      setPlayer(result)
      return
    }
    setMessages((prev) => [...prev, { role: 'assistant', content: result }])
    if (ttsRef.current) speak(result)
  }

  async function handleSend(text?: string): Promise<void> {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    const next: ChatMessage[] = [...messagesRef.current, { role: 'user', content }]
    setMessages(next)
    setLoading(true)
    try {
      const res: ChatResponse = await sendChat(next)
      const assistant: ChatMessage = { role: 'assistant', content: res.texto }
      setMessages((prev) => [...prev, assistant])
      if (ttsRef.current) speak(res.texto)
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

  function listenForCommand() {
    stopListening()
    listenForCommand(
      (text) => {
        if (text && text.trim()) {
          handleSend(text).finally(() => {
            if (voiceOn) startListeningForWake()
          })
        } else {
          startListeningForWake()
        }
      },
      () => {
        startListeningForWake()
      },
      (msg) => {
        if (msg === 'microfono-bloqueado') setMicBlocked(true)
      },
    )
  }

  function startListeningForWake() {
    if (!voiceOn) return
    setAwaitingWake(true)
    setMicBlocked(false)
    startWakeWord(
      () => {
        setAwaitingWake(false)
        stopListening()
        speak('decime', () => {
          listenForCommand()
        })
      },
      (msg) => {
        if (msg === 'microfono-bloqueado') {
          setMicBlocked(true)
          setAwaitingWake(false)
        }
      },
    )
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
          <div className={`text-xs ${awaitingWake && voiceOn && !micBlocked ? 'text-sky-400' : 'text-emerald-400'}`}>
            {micBlocked ? 'micrófono sin permiso' : voiceOn ? (awaitingWake ? 'escuchando "eh compa"...' : 'escuchando') : 'en línea'}
          </div>
        </div>
        <button
          onClick={() => setKiosk((k) => !k)}
          className="ml-auto rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
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

      {micBlocked && (
        <div className="flex items-center gap-3 border-t border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="flex-1 text-sm text-amber-300">Necesito permiso del micrófono para escucharte.</p>
          <button
            onClick={() => startListeningForWake()}
            className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-black hover:bg-amber-400"
          >
            Activar
          </button>
        </div>
      )}

      <footer className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
        <button
          onClick={() => setVoiceOn((v) => !v)}
          className={`rounded-full p-3 transition ${
            awaitingWake ? 'bg-sky-600 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
          aria-label="Activar/desactivar voz"
        >
          {voiceOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          onClick={() => setTtsOn((v) => !v)}
          className="rounded-full p-3 text-white/70 transition hover:bg-white/10"
          aria-label="Voz de respuesta"
        >
          {ttsOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={awaitingWake ? 'Decí "eh compa"...' : 'Escuchando...'}
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

      {player && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setPlayer(null)}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Cerrar reproductor"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="flex-1 truncate text-sm text-white/90">{player.title}</span>
          </div>
          <iframe
            className="flex-1 w-full"
            src={`https://www.youtube.com/embed/${player.id}?autoplay=1`}
            title={player.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  )
}
