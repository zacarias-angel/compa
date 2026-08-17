let recognition: any = null
let mode: 'idle' | 'wake' | 'command' = 'idle'

function getRecognition() {
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!SR) return null
  return new SR()
}

export function isSpeechSupported(): boolean {
  const w = window as any
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function isTtsSupported(): boolean {
  return 'speechSynthesis' in window
}

function stopRecognition() {
  if (recognition) {
    try {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.stop()
    } catch {}
    recognition = null
  }
}

export function stopListening() {
  mode = 'idle'
  stopRecognition()
}

export function startWakeWord(onWake: () => void, onError?: (msg: string) => void) {
  const r = getRecognition()
  if (!r) {
    onError?.('Este navegador no soporta reconocimiento de voz')
    return
  }
  stopRecognition()
  mode = 'wake'
  recognition = r
  r.lang = 'es-AR'
  r.continuous = true
  r.interimResults = true
  r.maxAlternatives = 1

  r.onresult = (e: any) => {
    let text = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript + ' '
    }
    const t = text.toLowerCase()
    if (/(compa|acompá|acompa|compañero)/.test(t)) {
      onWake()
    }
  }

  r.onerror = (e: any) => {
    console.log('recognition error:', e?.error)
    if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
      onError?.('microfono-bloqueado')
      return
    }
    if (mode === 'wake') {
      setTimeout(() => startWakeWord(onWake, onError), 1000)
    }
  }

  r.onend = () => {
    if (mode === 'wake') {
      setTimeout(() => startWakeWord(onWake, onError), 300)
    }
  }

  try {
    r.start()
  } catch {
    if (mode === 'wake') setTimeout(() => startWakeWord(onWake, onError), 1000)
  }
}

export function listenOnce(
  onResult: (text: string) => void,
  onEnd: () => void,
  onError?: (msg: string) => void,
) {
  const r = getRecognition()
  if (!r) {
    onEnd()
    return
  }
  stopRecognition()
  mode = 'command'
  recognition = r
  r.lang = 'es-AR'
  r.continuous = false
  r.interimResults = false
  r.maxAlternatives = 1

  let done = false
  r.onresult = (e: any) => {
    const text = e.results[0][0].transcript
    if (!done) {
      done = true
      onResult(text)
    }
  }
  r.onerror = (e: any) => {
    if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
      onError?.('microfono-bloqueado')
    }
    if (!done) {
      done = true
      onEnd()
    }
  }
  r.onend = () => {
    if (!done) {
      done = true
      onEnd()
    }
  }
  try {
    r.start()
  } catch {
    if (!done) {
      done = true
      onEnd()
    }
  }
}

export function speak(text: string, onEnd?: () => void) {
  if (!('speechSynthesis' in window) || !text) {
    onEnd?.()
    return
  }
  try {
    window.speechSynthesis.cancel()
  } catch {}
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'es-AR'
  u.rate = 1.05
  const voices = window.speechSynthesis.getVoices()
  const es = voices.find((v) => v.lang?.toLowerCase().startsWith('es'))
  if (es) u.voice = es
  if (onEnd) {
    u.onend = onEnd
    u.onerror = onEnd
  }
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  try {
    window.speechSynthesis.cancel()
  } catch {}
}
