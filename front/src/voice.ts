let recognition: any = null
let speaking = false

function getRecognition() {
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!SR) return null
  const r = new SR()
  r.lang = 'es-AR'
  r.continuous = false
  r.interimResults = false
  r.maxAlternatives = 1
  return r
}

export function isSpeechSupported(): boolean {
  const w = window as any
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function isTtsSupported(): boolean {
  return 'speechSynthesis' in window
}

export function listenOnce(onResult: (text: string) => void, onEnd: () => void): boolean {
  const r = getRecognition()
  if (!r) {
    onEnd()
    return false
  }
  let done = false
  r.onresult = (e: any) => {
    const text = e.results[0][0].transcript
    if (!done) {
      done = true
      onResult(text)
    }
  }
  r.onerror = () => {
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
    return true
  } catch {
    onEnd()
    return false
  }
}

export function speak(text: string) {
  if (!('speechSynthesis' in window) || !text) return
  try {
    window.speechSynthesis.cancel()
  } catch {}
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'es-AR'
  u.rate = 1.05
  const voices = window.speechSynthesis.getVoices()
  const es = voices.find((v) => v.lang?.toLowerCase().startsWith('es'))
  if (es) u.voice = es
  speaking = true
  u.onend = () => {
    speaking = false
  }
  u.onerror = () => {
    speaking = false
  }
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  try {
    window.speechSynthesis.cancel()
  } catch {}
  speaking = false
}

export function isSpeaking(): boolean {
  return speaking
}
