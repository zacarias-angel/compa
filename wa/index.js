import express from 'express'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { toDataURL } from 'qrcode'
import { existsSync, readFileSync, writeFileSync } from 'fs'

const app = express()
app.use(express.json())

const AUTH_DIR = process.env.AUTH_DIR || './auth_info'
const PORT = process.env.PORT || 3001
const logger = pino({ level: 'silent' })

let sock = null
let qrCode = null
let connected = false
let loggedIn = false
let contacts = {}

const CONTACTS_FILE = `${AUTH_DIR}/contacts.json`

if (existsSync(CONTACTS_FILE)) {
  try {
    contacts = JSON.parse(readFileSync(CONTACTS_FILE, 'utf8'))
  } catch {
    contacts = {}
  }
}

function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function saveContacts() {
  try {
    writeFileSync(CONTACTS_FILE, JSON.stringify(contacts))
  } catch {}
}

function registerContacts(list) {
  for (const c of list) {
    const name = c.notify || c.name || c.verifiedName
    const jid = c.id
    if (name && jid && jid.endsWith('@s.whatsapp.net')) {
      contacts[normalize(name)] = { name, jid }
    }
  }
  saveContacts()
}

function registerChats(list) {
  for (const chat of list) {
    const c = chat.contact || chat
    const name = c.notify || c.name || c.verifiedName
    const jid = c.id || chat.id
    if (name && jid && jid.endsWith('@s.whatsapp.net')) {
      contacts[normalize(name)] = { name, jid }
    }
  }
  saveContacts()
}

function findJid(nombre) {
  const key = normalize(nombre)
  if (contacts[key]) return contacts[key].jid
  for (const [k, v] of Object.entries(contacts)) {
    if (k.includes(key) || key.includes(k)) return v.jid
  }
  return null
}

async function start() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

    let version
    try {
      const v = await fetchLatestBaileysVersion()
      version = v.version
    } catch {
      version = [2, 3000, 1015901307]
    }

    loggedIn = !!state.creds?.registered

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
    })

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update
      if (qr) qrCode = qr
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        connected = false
        if (code !== DisconnectReason.loggedOut) {
          setTimeout(() => start().catch(() => {}), 3000)
        }
      } else if (connection === 'open') {
        connected = true
        qrCode = null
      }
    })

    sock.ev.on('creds.update', (c) => {
      saveCreds(c)
      if (c?.registered) loggedIn = true
    })

    sock.ev.on('contacts.upsert', (u) => registerContacts(u.contacts))
    sock.ev.on('contacts.update', (u) => registerContacts(u))
    sock.ev.on('chats.upsert', (u) => registerChats(u))
    sock.ev.on('messaging-history.set', (u) => {
      for (const chat of u.chats || []) registerChats([chat])
    })
  } catch (e) {
    console.error('start error:', e?.message || e)
    setTimeout(() => start().catch(() => {}), 5000)
  }
}

function waitForOpen(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (connected && sock) return resolve()
    const started = Date.now()
    const timer = setInterval(() => {
      if (connected && sock) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error('tiempo de espera agotado'))
      }
    }, 300)
  })
}

app.get('/qr', async (req, res) => {
  if (loggedIn) return res.json({ connected: true, qr: null })
  if (!qrCode) return res.json({ connected: false, qr: null })
  const dataUrl = await toDataURL(qrCode)
  res.json({ connected: false, qr: dataUrl })
})

app.post('/pairing-code', async (req, res) => {
  if (loggedIn) return res.json({ ok: true, connected: true, code: null })
  const phone = (req.body?.phone || '').replace(/[^0-9]/g, '')
  if (!phone) {
    return res.status(400).json({ ok: false, error: 'Falta el número de teléfono' })
  }
  try {
    await waitForOpen()
    const code = await sock.requestPairingCode(phone)
    return res.json({ ok: true, code })
  } catch (e) {
    return res.json({ ok: false, error: String(e) })
  }
})

app.get('/status', (req, res) => {
  res.json({ connected: loggedIn, contactCount: Object.keys(contacts).length })
})

app.post('/send', async (req, res) => {
  if (!loggedIn || !sock) {
    return res.status(503).json({ ok: false, error: 'WhatsApp no conectado' })
  }
  const { contacto, mensaje } = req.body || {}
  const jid = findJid(contacto || '')
  if (!jid) {
    return res.json({ ok: false, error: `No encontré el contacto "${contacto}"` })
  }
  try {
    await sock.sendMessage(jid, { text: mensaje })
    return res.json({ ok: true, jid })
  } catch (e) {
    return res.json({ ok: false, error: String(e) })
  }
})

app.get('/contacts', (req, res) => {
  const names = Object.values(contacts).map((c) => c.name)
  res.json({ names })
})

app.listen(PORT, () => console.log(`wa-service en :${PORT}`))
start().catch(() => {})

process.on('unhandledRejection', (e) => {
  console.error('unhandledRejection:', e?.message || e)
})
process.on('uncaughtException', (e) => {
  console.error('uncaughtException:', e?.message || e)
})
