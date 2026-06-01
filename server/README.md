# DAP AI — Self-hosted backend

This folder contains everything you need to run the DAP AI backend on **your
own hardware** (a desktop with a GPU, a Mac, a homelab box, anything) and
point the website at it. The frontend in this repo already proxies all chat
requests through `/api/chat`, which forwards them to whatever URL is in the
`AI_BACKEND_URL` environment variable.

You don't need to touch the frontend code. You just need:

1. A local OpenAI-compatible AI server (LM Studio, Ollama, vLLM, llama.cpp…)
2. A way to make that server reachable from the internet (a tunnel)
3. The `AI_BACKEND_URL` secret set to that tunnel URL

That's it. Multiple people can chat at the same time — the relay is fully
stateless and every request opens its own connection to your AI server.

---

## Option A — LM Studio (easiest, has a GUI)

1. Install **LM Studio** → <https://lmstudio.ai>
2. In LM Studio, download a model (e.g. `llama-3.1-8b-instruct`, `qwen2.5-7b`,
   anything that fits your VRAM).
3. Go to the **Developer / Local Server** tab and click **Start Server**.
   - Default URL: `http://localhost:1234/v1`
   - Endpoint used by this app: `http://localhost:1234/v1/chat/completions`
4. Make sure **"Serve on local network"** is on if you want other devices on
   your LAN to reach it directly. For the public website, you still need a
   tunnel (next step).

LM Studio's server is OpenAI-compatible, so the request body the relay
forwards (`{ model, messages, stream }`) works without modification.

## Option B — Ollama (terminal, lightweight)

```bash
# Install: https://ollama.com
ollama pull llama3
ollama serve
# Endpoint: http://localhost:11434/v1/chat/completions
```

## Option C — Any OpenAI-compatible server

vLLM, llama.cpp's `server`, text-generation-webui's OpenAI extension, Jan,
Msty, etc. all work. You just need a URL that accepts
`POST /v1/chat/completions` with the OpenAI message format.

---

## Exposing it to the internet

Your AI server is on `localhost`. The deployed website can't see that, so
you need a tunnel. Pick one:

**ngrok** (easiest)
```bash
# Sign up free at ngrok.com, then:
ngrok http 1234        # for LM Studio
ngrok http 11434       # for Ollama
```
Copy the `https://xxxx.ngrok-free.app` URL it prints.

**Cloudflare Tunnel** (free, no signup for quick tunnels)
```bash
cloudflared tunnel --url http://localhost:1234
```

**Tailscale Funnel** (if you already use Tailscale)
```bash
tailscale funnel 1234
```

---

## Wiring it up

In the Lovable project (or wherever the site is deployed), set this secret:

```
AI_BACKEND_URL = https://xxxx.ngrok-free.app/v1/chat/completions
```

Optional, if your server requires a bearer token:

```
AI_BACKEND_KEY = sk-your-token
```

Reload the site → every chat goes through `/api/chat` → your hardware.

You can change the model and the system prompt from **Admin** in the app.
The system prompt is sent as the first `system` message on every request.

---

## Connecting GitHub later

When you connect this repo to GitHub, this `server/` folder comes with it,
and so does the relay at `src/routes/api/chat.ts`. If you ever want to host
the relay yourself instead of using Lovable's, the reference Node script
below does exactly the same thing.

### Reference standalone relay (`relay.mjs`)

Run this on any always-on machine (a $5 VPS, a Raspberry Pi, your homelab).
It accepts requests from the website and forwards them to your local AI
server. Useful if you don't want to use Lovable's built-in relay.

```bash
node server/relay.mjs
# Listens on :8787 by default
# Set AI_BACKEND_URL to your LM Studio / Ollama endpoint
```

Then point the site at `https://your-relay.example.com` instead of running
through `/api/chat`.

---

## Concurrency / multiple users

The relay is stateless. Each incoming HTTP request opens its own `fetch` to
your AI backend, so N users chatting = N concurrent requests to LM Studio /
Ollama. The bottleneck is your GPU's batching limit, not the relay.

- **LM Studio**: handles concurrent requests; throughput depends on the
  model + context length.
- **Ollama**: set `OLLAMA_NUM_PARALLEL=4` (or higher) to allow parallel
  requests, and `OLLAMA_MAX_LOADED_MODELS=1` if you only have one model.
- **vLLM**: batches automatically and is the best choice for many users.

Chat history is stored **per-browser** in `localStorage`, so different
users naturally have separate conversations without any backend state.
