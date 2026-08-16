import os
import json
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent / ".env")

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

SYSTEM_PROMPT = """Sos "Compa", un asistente personal de voz que vive en un celular kiosko. La palabra para activarte es "eh compa". Respondé siempre en español rioplatense, breve y natural.

Tu tarea es interpretar lo que pide el usuario y devolver SIEMPRE un JSON válido con esta estructura:

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
  * Si el usuario pide una canción por una frase de la letra o no sabe el nombre, usá esa frase EXACTAMENTE como "busqueda" (no intentes adivinar el título ni aclarar que no la conocés).
- whatsapp: enviar mensaje. parametros: {"contacto": "nombre", "mensaje": "texto"}
- email: enviar correo. parametros: {"destinatario": "email", "asunto": "texto", "cuerpo": "texto"}
- luz_on / luz_off: prender/apagar la luz. parametros: {}
- musica_on / musica_off: prender/apagar el equipo de música. parametros: {}

Reglas de confirmación:
- youtube: no requiere confirmación (es inofensivo).
- whatsapp y email: requieren confirmación (requiere_confirmacion: true). Si el mensaje o destinatario no están completos, preguntá lo que falte y no pongas acción.
- luz y musica: no requieren confirmación, pero si no sabés qué hacer, preguntá.

Si el usuario charla o pregunta algo sin acción, poné "accion": null y respondé normalmente.

Devolvé SOLO el JSON, sin texto alrededor."""

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


@app.get("/health")
def health():
    return {"status": "ok", "model": DEEPSEEK_MODEL}


@app.get("/youtube/search")
def youtube_search(q: str):
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


@app.post("/chat")
def chat(req: ChatRequest):
    if not DEEPSEEK_API_KEY:
        return {
            "texto": "No tengo configurada la clave de DeepSeek. Configurá DEEPSEEK_API_KEY.",
            "accion": None,
            "requiere_confirmacion": False,
        }

    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in req.messages:
        msgs.append({"role": m.role, "content": m.content})

    resp = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=msgs,
        temperature=0.4,
        response_format={"type": "json_object"},
    )

    raw = resp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"texto": raw, "accion": None, "requiere_confirmacion": False}

    return {
        "texto": parsed.get("texto", ""),
        "accion": parsed.get("accion"),
        "requiere_confirmacion": parsed.get("requiere_confirmacion", False),
    }
