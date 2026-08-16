# Compa — Asistente personal

Asistente de voz/texto que corre en un VPS (Coolify + Docker) y se usa desde un celular Android como kiosko. Se activa con la palabra "eh compa".

## Estructura

```
agente/
├── back/                 # Backend FastAPI + cerebro DeepSeek
│   ├── main.py           # API /chat y /health
│   ├── requirements.txt
│   └── Dockerfile
├── front/                # Frontend React/Vite (kiosko chat)
│   ├── src/
│   └── Dockerfile
├── docker-compose.yml    # Levanta back + front juntos
└── .env.example
```

## Configuración

Copiá `.env.example` a `.env` y completá:

```
DEEPSEEK_API_KEY=sk-...
COMPA_PASSWORD=tu-clave-secreta
```

`COMPA_PASSWORD` es la contraseña para entrar al kiosko (login). Si la dejás vacía, no pide contraseña.

## Desarrollo local

Backend (puerto 8000):

```bash
cd back
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend (puerto 5173, con proxy /api → 8000):

```bash
cd front
npm install
npm run dev
```

## Deploy con Coolify

### Opción A — Docker Compose (recomendado)

1. En Coolify creá un **Project** → **New Resource** → **Docker Compose**
2. Apuntá al repo de Git que contiene `agente/`
3. En las variables de entorno agregá `DEEPSEEK_API_KEY` y `COMPA_PASSWORD`
4. Deploy

El frontend queda expuesto en el puerto **3000** del host (no 80, porque Traefik lo usa).

### Exponer con Cloudflare Tunnel

Como el VPS tiene IP compartida, usá un túnel para acceder desde afuera:

- Subdominio: `compa.angelzacarias.uk`
- Type: `HTTP`
- URL: `localhost:3000`

### Opción B — Dos aplicaciones separadas

1. **Back**: `Application` → Dockerfile en `back/` → variable `DEEPSEEK_API_KEY`
2. **Front**: `Application` → Dockerfile en `front/`

Si los desplegás separados, editá `front/nginx.conf` y cambiá `http://back:8000` por la IP/hostname interno del backend en Coolify.

## Contactos (WhatsApp)

Los contactos se mapean en `front/src/contacts.ts`:

```ts
export const contacts: Record<string, string> = {
  amor: '+549XXXXXXXXXX',
}
```

Reemplazá `+549XXXXXXXXXX` por el número real (con código de país).

## Acciones soportadas (Fase 1)

- **YouTube**: abre el video directo (con `yt-dlp`)
- **WhatsApp**: envía mensaje (con confirmación)
- **Email**: abre Gmail con mailto
- **Clima**: usa Open-Meteo (gratis)
- **Búsqueda web**: usa DuckDuckGo (gratis)
- **Luz / Música**: devuelve orden (ESP32 en fase 3)

## Modo kiosko

En el header hay un botón de maximizar que pone la app en pantalla completa y mantiene la pantalla encendida (wake lock). Ideal para el celular siempre conectado.

## Fases futuras

- Fase 2: Voz (STT Whisper + TTS Piper)
- Fase 3: ESP32 + relé (MQTT)
- Fase 4: Avatar Mixamo (three.js)
