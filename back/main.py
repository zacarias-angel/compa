import os
import json
import hashlib
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent / ".env")

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

COMPA_PASSWORD = os.environ.get("COMPA_PASSWORD", "")

WA_URL = os.environ.get("WA_URL", "http://wa:3001")
WA_PHONE = os.environ.get("WA_PHONE", "")

client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)


def make_token() -> str:
    return hashlib.sha256(f"compa:{COMPA_PASSWORD}".encode()).hexdigest()


def require_auth(authorization: Optional[str] = Header(default=None)):
    if not COMPA_PASSWORD:
        return
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token != make_token():
        raise HTTPException(status_code=401, detail="No autorizado")


SYSTEM_PROMPT = """Sos "Compa", un asistente personal de voz que vive en un celular kiosko. La palabra para activarte es "eh compa". Respondé siempre en español rioplatense, breve y natural.

Tenés acceso a herramientas para obtener información actual de internet:
- get_weather: clima actual de una ciudad
- search_web: buscar información actual (noticias, estado de servicios, datos de hoy, cotizaciones, etc.)
- list_contacts: obtener la lista de contactos de WhatsApp disponibles

Usá esas herramientas cuando el usuario pregunte algo que necesite datos actuales de internet (clima, noticias, cotizaciones, estado de trenes/servicios, etc.). Para preguntas de conocimiento general que ya sabés, respondé directo. Si el usuario pide ver la lista de contactos, usá la herramienta list_contacts.

Además, interpretá acciones que pide el usuario. Devolvé SIEMPRE (como respuesta final, sin tool calls) un JSON válido con esta estructura:

{
  "texto": "lo que decís al usuario en voz alta (corto, natural)",
  "accion": {
    "tipo": "youtube" | "whatsapp" | "email" | "luz_on" | "luz_off" | "musica_on" | "musica_off" | null,
    "parametros": { ... }
  },
  "requiere_confirmacion": true | false
}

Reglas de acciones:
- youtube: buscar/reproducir en YouTube. parametros: {"busqueda": "texto a buscar"}
  * Si el usuario pide una canción por una frase de la letra o no sabe el nombre, usá esa frase EXACTAMENTE como "busqueda".
- whatsapp: enviar mensaje. parametros: {"contacto": "nombre", "mensaje": "texto"}
- email: enviar correo. parametros: {"destinatario": "email", "asunto": "texto", "cuerpo": "texto"}
- luz_on / luz_off: prender/apagar la luz. parametros: {}
- musica_on / musica_off: prender/apagar el equipo de música. parametros: {}

Reglas de confirmación:
- youtube: no requiere confirmación.
- whatsapp y email: requieren confirmación (requiere_confirmacion: true). Si faltan datos, preguntá lo que falta y no pongas acción.
- luz y musica: no requieren confirmación.

Si el usuario charla o pregunta algo sin acción, poné "accion": null y respondé normalmente.

Devolvé SOLO el JSON, sin texto alrededor."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Obtener el clima actual de una ciudad",
            "parameters": {
                "type": "object",
                "properties": {
                    "ciudad": {"type": "string", "description": "Nombre de la ciudad"}
                },
                "required": ["ciudad"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Buscar información actual en internet para responder preguntas",
            "parameters": {
                "type": "object",
                "properties": {
                    "consulta": {"type": "string", "description": "La consulta a buscar"}
                },
                "required": ["consulta"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_contacts",
            "description": "Obtener la lista de contactos de WhatsApp disponibles",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
]

app = FastAPI(title="Agente Compa")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]


class LoginRequest(BaseModel):
    password: str


class WASendRequest(BaseModel):
    contacto: str
    mensaje: str


def get_weather(ciudad: str) -> str:
    try:
        geo = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": ciudad, "count": 1, "language": "es"},
            timeout=10,
        ).json()
        results = geo.get("results") or []
        if not results:
            return f"No encontré la ciudad '{ciudad}'."
        r = results[0]
        name = r.get("name", ciudad)
        lat, lon = r.get("latitude"), r.get("longitude")

        w = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
                "timezone": "auto",
            },
            timeout=10,
        ).json()
        cur = w.get("current") or {}
        code = cur.get("weather_code", 0)
        desc = {
            0: "despejado", 1: "mayormente despejado", 2: "parcialmente nublado",
            3: "nublado", 45: "neblina", 48: "neblina con escarcha",
            51: "llovizna leve", 61: "lluvia leve", 63: "lluvia", 65: "lluvia intensa",
            80: "chaparrones", 95: "tormenta",
        }.get(code, "condición variable")
        return (
            f"En {name} hay {cur.get('temperature_2m')}°C (sensación "
            f"{cur.get('apparent_temperature')}°C), {desc}. "
            f"Humedad {cur.get('relative_humidity_2m')}%, viento {cur.get('wind_speed_10m')} km/h."
        )
    except Exception:
        return "No pude obtener el clima en este momento."


def search_web(consulta: str) -> str:
    try:
        r = requests.get(
            "https://api.duckduckgo.com/",
            params={"q": consulta, "format": "json", "no_html": 1, "skip_disambig": 1},
            timeout=10,
            headers={"User-Agent": "compa-agent/1.0"},
        ).json()
        pieces = []
        if r.get("AbstractText"):
            pieces.append(r["AbstractText"])
        if r.get("Answer"):
            pieces.append(r["Answer"])
        for t in (r.get("RelatedTopics") or [])[:3]:
            if isinstance(t, dict) and t.get("Text"):
                pieces.append(t["Text"])
        if not pieces:
            return f"No encontré resultados claros para '{consulta}'."
        return " ".join(pieces)[:1500]
    except Exception:
        return f"No pude buscar '{consulta}' en este momento."


def list_contacts() -> str:
    try:
        r = requests.get(f"{WA_URL}/contacts", timeout=5)
        data = r.json()
        names = data.get("names", [])
        if not names:
            return "No hay contactos sincronizados todavía."
        return "Contactos disponibles: " + ", ".join(names)
    except Exception:
        return "No pude obtener los contactos."


def run_tool(name: str, args: dict) -> str:
    if name == "get_weather":
        return get_weather(args.get("ciudad", ""))
    if name == "search_web":
        return search_web(args.get("consulta", ""))
    if name == "list_contacts":
        return list_contacts()
    return ""


@app.get("/health")
def health():
    return {"status": "ok", "model": DEEPSEEK_MODEL, "auth": bool(COMPA_PASSWORD)}


@app.post("/login")
def login(req: LoginRequest):
    if not COMPA_PASSWORD:
        return {"ok": True, "token": ""}
    if req.password != COMPA_PASSWORD:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    return {"ok": True, "token": make_token()}


@app.get("/youtube/search")
def youtube_search(q: str, _: None = Depends(require_auth)):
    import yt_dlp

    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch1:{q}", download=False)
            entries = info.get("entries", []) if info else []
            if entries:
                first = entries[0]
                vid = first.get("id") or first.get("url")
                return {
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "title": first.get("title", ""),
                }
    except Exception:
        pass
    return {"url": None, "title": ""}


@app.post("/wa/send")
def wa_send(req: WASendRequest, _: None = Depends(require_auth)):
    try:
        r = requests.post(
            f"{WA_URL}/send",
            json={"contacto": req.contacto, "mensaje": req.mensaje},
            timeout=30,
        )
        data = r.json()
        return {"ok": data.get("ok", False), "error": data.get("error", "")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/wa/status")
def wa_status(_: None = Depends(require_auth)):
    try:
        r = requests.get(f"{WA_URL}/status", timeout=5)
        return r.json()
    except Exception as e:
        return {"connected": False, "error": str(e)}


@app.get("/wa/qr")
def wa_qr(_: None = Depends(require_auth)):
    try:
        r = requests.get(f"{WA_URL}/qr", timeout=5)
        return r.json()
    except Exception as e:
        return {"connected": False, "qr": None, "error": str(e)}


@app.post("/wa/pairing-code")
def wa_pairing_code(req: dict, _: None = Depends(require_auth)):
    phone = req.get("phone", "") or WA_PHONE
    if not phone:
        return {"ok": False, "error": "No hay número configurado. Poné WA_PHONE en el entorno."}
    try:
        r = requests.post(f"{WA_URL}/pairing-code", json={"phone": phone}, timeout=30)
        return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/chat")
def chat(req: ChatRequest, _: None = Depends(require_auth)):
    if not DEEPSEEK_API_KEY:
        return {
            "texto": "No tengo configurada la clave de DeepSeek. Configurá DEEPSEEK_API_KEY.",
            "accion": None,
            "requiere_confirmacion": False,
        }

    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in req.messages:
        msgs.append({"role": m.role, "content": m.content})

    raw = None
    for _ in range(4):
        resp = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=msgs,
            temperature=0.4,
            tools=TOOLS,
        )
        msg = resp.choices[0].message
        if msg.tool_calls:
            msgs.append(
                {
                    "role": "assistant",
                    "content": msg.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                }
            )
            for tc in msg.tool_calls:
                args = json.loads(tc.function.arguments or "{}")
                result = run_tool(tc.function.name, args)
                msgs.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": result}
                )
            continue
        raw = msg.content
        break

    if raw is None:
        raw = "{}"

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"texto": raw, "accion": None, "requiere_confirmacion": False}

    return {
        "texto": parsed.get("texto", ""),
        "accion": parsed.get("accion"),
        "requiere_confirmacion": parsed.get("requiere_confirmacion", False),
    }
