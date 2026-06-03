# DAP AI — Run It On Your Own PC

This is the full, step-by-step guide for hosting **DAP AI** on your own
hardware (your gaming PC, a Mac, a homelab box, anything with a GPU) and
pointing the live website at it. Multiple users can chat at the same time —
each request opens its own connection to your AI server.

Nothing in the frontend needs to change. Everything you control is:
1. A local AI server on your PC (LM Studio is easiest).
2. A tunnel that gives that local server a public URL.
3. One secret on the website: `AI_BACKEND_URL` (and optionally `AI_BACKEND_KEY`).

Once that's set, every chat goes:

```
browser → dapaibackend.lovable.app → /api/chat (relay) → your tunnel → your PC
```

---

## Part 1 — Pick an AI server (on your PC)

You need an OpenAI-compatible server. All four below work — just pick one.

### Option A — LM Studio (recommended, has a UI)

1. Download from <https://lmstudio.ai> and install.
2. Open LM Studio → **Discover** tab → download a model.
   Good starting picks (use a Q4 or Q5 quant that fits your VRAM):
   - `meta-llama-3.1-8b-instruct`
   - `qwen2.5-7b-instruct`
   - `mistral-nemo-12b-instruct`
3. Go to the **Developer** tab (the `>_` icon on the left).
4. At the top, load the model you downloaded.
5. Click **Start Server**. Defaults are fine:
   - Port: `1234`
   - Endpoint: `http://localhost:1234/v1/chat/completions`
6. Verify it works locally — open a terminal and run:
   ```bash
   curl http://localhost:1234/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"local-model","messages":[{"role":"user","content":"hi"}]}'
   ```
   You should get a JSON response with a reply.

**About the system prompt** — LM Studio's OpenAI-compatible server fully
respects the `system` message that this site sends as the first message in
every request. Whatever you put in **Admin → System prompt** in the website
is forwarded to LM Studio on every call. Do **not** also set a system prompt
inside LM Studio's chat UI — that one is only used by LM Studio's own chat
panel and is ignored when external apps (like this site) hit the API.

### Option B — Ollama (terminal, lightweight)

```bash
# Install from https://ollama.com, then:
ollama pull llama3.1:8b
ollama serve
```
Endpoint: `http://localhost:11434/v1/chat/completions`

To allow multiple concurrent users:
```bash
OLLAMA_NUM_PARALLEL=4 OLLAMA_MAX_LOADED_MODELS=1 ollama serve
```

### Option C — vLLM (best for many users, Linux + NVIDIA)

```bash
pip install vllm
vllm serve meta-llama/Meta-Llama-3.1-8B-Instruct --port 8000
```
Endpoint: `http://localhost:8000/v1/chat/completions`

### Option D — llama.cpp, Jan, Msty, text-generation-webui…

Anything that speaks OpenAI's `POST /v1/chat/completions` works. You only
need the URL.

---

## Part 2 — Expose your PC to the internet (tunnel)

Your AI server is on `localhost`. The website on the public internet can't
reach `localhost`. You need a tunnel.

### Option A — ngrok (easiest)

1. Sign up free at <https://ngrok.com>.
2. Install: <https://ngrok.com/download>.
3. Run the auth command they show you once (`ngrok config add-authtoken …`).
4. Start the tunnel for whichever port your AI server uses:
   ```bash
   ngrok http 1234      # LM Studio
   ngrok http 11434     # Ollama
   ngrok http 8000      # vLLM
   ```
5. ngrok prints a line like:
   ```
   Forwarding   https://abcd-12-34-56-78.ngrok-free.app -> http://localhost:1234
   ```
   Copy that `https://…ngrok-free.app` URL. **Leave this terminal open** —
   when you close it, the tunnel dies.

### Option B — Cloudflare Tunnel (no signup for quick tunnels)

```bash
# Install: https://github.com/cloudflare/cloudflared
cloudflared tunnel --url http://localhost:1234
```
Copy the `https://…trycloudflare.com` URL it prints.

### Option C — Tailscale Funnel (if you already use Tailscale)

```bash
tailscale funnel 1234
```

### Option D — Static URL (for always-on use)

Quick tunnels rotate URLs every restart. If you want a stable URL, either:
- Pay for an ngrok static domain ($/mo), or
- Use a `cloudflared` named tunnel pointed at a domain you own, or
- Buy a $5/mo VPS and run `server/relay.mjs` there (see Part 5).

---

## Part 3 — Tell the website where your PC is

### Single AI

The website needs ONE secret: `AI_BACKEND_URL`. This is the **full**
chat-completions URL, including `/v1/chat/completions`.

### Two AIs from ONE LM Studio (recommended)

LM Studio only runs one server at a time, but it can hold **multiple
models loaded at once** and pick which one to use based on the `model`
field of each request. So you only need **one** LM Studio and **one**
ngrok tunnel for both `DAP AI 3.2` (Pro) and `DAP AI Lite`.

1. In LM Studio's **Developer** tab, load BOTH models (the big one for
   Pro, a smaller/faster one for Lite). Both should be in the
   loaded-models list at the top.
2. Click **Start Server** once. One port, one tunnel.
3. Note each model's exact identifier as LM Studio shows it
   (e.g. `meta-llama-3.1-8b-instruct`, `qwen2.5-3b-instruct`).
4. Set these four secrets via the agent:
   - `AI_BACKEND_URL_PRO`   = `https://<your-tunnel>/v1/chat/completions`
   - `AI_BACKEND_URL_LITE`  = **same URL** as above
   - `AI_BACKEND_MODEL_PRO`  = the big model's identifier
   - `AI_BACKEND_MODEL_LITE` = the small model's identifier

The relay translates the site's model name (`dap-ai-1.0` / `dap-ai-lite`)
into the matching LM Studio identifier before forwarding. Per-model
system prompts (set in `/admin`) keep working unchanged.

If both models don't fit in VRAM, drop one to a lower quant (Q4) or
pick a smaller Lite model (3B–4B is plenty).



Examples:
- LM Studio via ngrok → `https://abcd-12-34-56-78.ngrok-free.app/v1/chat/completions`
- Ollama via cloudflared → `https://random.trycloudflare.com/v1/chat/completions`
- vLLM via Tailscale Funnel → `https://yourpc.tailnet.ts.net/v1/chat/completions`

### How to set it

1. Open the project in Lovable.
2. Open the chat with the AI agent (the one you're reading this from).
3. Say: **"Add a secret AI_BACKEND_URL with value `<paste your full URL>`"**.
4. Confirm in the popup.

If your AI server requires a token (LM Studio doesn't by default, vLLM can,
some hosted servers do), also add:
- `AI_BACKEND_KEY` = `sk-your-token`

The site automatically attaches it as `Authorization: Bearer …`.

### Verify it's working

1. Open the live site: <https://dapaibackend.lovable.app>
2. Sign up (the **first** account becomes admin automatically — see Part 4).
3. Send a chat message. You should get a reply from your local model.
4. If you get *"No AI backend configured yet"* → the secret isn't set.
5. If you get *"Couldn't reach AI backend: …"* → tunnel is down or URL is wrong.

---

## Part 4 — Admin access and switching user plans

### Becoming admin

The first person who signs up on the site **automatically becomes admin**.
Sign up first, before sharing the site with anyone else.

### Promote / demote users (from the website)

1. Sign in with your admin account.
2. Click your avatar → **Admin Console**, or go to `/admin`.
3. Scroll to **User tiers** — you'll see every account.
4. Click **Promote to Pro** or **Move to Free** next to each user.

What the tiers mean:
- **Free**: 5 messages on DAP AI 3.2, then auto-falls back to DAP AI Lite forever.
- **Pro**: Unlimited DAP AI 3.2.

Promoting to Pro also resets the user's `pro_messages_used` counter to 0.

### Switching plans directly in the database

If you ever want to bulk-edit or do it outside the UI, you can also run SQL
through the project's backend. Tables that matter:

- `public.profiles` — has a `tier` column (`free` or `pro`) and
  `pro_messages_used` counter.
- `public.user_roles` — gives someone admin powers.
- `public.chats` + `public.chat_messages` — every conversation, scoped per user.

Example SQL:
```sql
-- Move user to Pro and reset their counter
UPDATE public.profiles
SET tier = 'pro', pro_messages_used = 0
WHERE email = 'someone@example.com';

-- Move user back to Free
UPDATE public.profiles SET tier = 'free' WHERE email = 'someone@example.com';

-- Make someone else an admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles WHERE email = 'you@example.com';
```

### Setting the system prompt

1. Go to **Admin Console** (`/admin`).
2. Edit the **System prompt** box. This is what every conversation starts with.
3. Click **Save**. It's stored per-browser, so update it on whichever machine
   you administer from. It is automatically sent to LM Studio / Ollama / vLLM
   as the first `system` message on every chat.

---

## Part 5 — Optional: run your own relay instead of Lovable's

By default the site uses the built-in relay at `/api/chat`. If you'd rather
run the relay yourself (e.g. on a $5 VPS so you don't depend on Lovable's
servers), the file `server/relay.mjs` is a 50-line drop-in:

```bash
# On any always-on Linux machine:
AI_BACKEND_URL=http://localhost:1234/v1/chat/completions \
AI_BACKEND_KEY=optional-token \
PORT=8787 \
ALLOWED_ORIGIN=https://dapaibackend.lovable.app \
  node server/relay.mjs
```

Then point the site at it instead of the built-in relay. (Ask the agent:
"swap `/api/chat` to forward to `https://my-relay.example.com`" — small
change in `src/routes/api/chat.ts`.)

---

## Part 6 — Limits and behaviour you should know

- **Rate limit**: each user is capped at **5 words per second** (with a
  small burst). This is to stop one person from melting the GPU. The cap
  lives in `src/routes/api/chat.ts` — change `RATE_WORDS_PER_SEC` if you
  want different.
- **Concurrent users**: the relay is stateless. N users chatting = N
  parallel requests to LM Studio. Throughput is GPU-bound, not relay-bound.
  - LM Studio: handles concurrency, slower per-request when batched.
  - Ollama: set `OLLAMA_NUM_PARALLEL=4` or higher.
  - vLLM: batches automatically — best choice for many users.
- **Chat history**: stored in Supabase, scoped to each user via RLS.
- **Accounts**: stored in `auth.users` + `public.profiles`. Free vs Pro
  lives on `profiles.tier`.

---

## Part 7 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `No AI backend configured yet` | `AI_BACKEND_URL` secret isn't set | Set it via the agent (Part 3). |
| `Couldn't reach AI backend: fetch failed` | Tunnel died / PC asleep / wrong URL | Restart your tunnel, double-check the URL ends in `/v1/chat/completions`. |
| `Rate limit: max 5 words/sec…` | You typed a very long message | Wait the seconds shown, or raise the cap in `src/routes/api/chat.ts`. |
| Replies are slow | GPU is the bottleneck | Use a smaller model / lower quant, or switch to vLLM. |
| Model ignores the system prompt | System prompt is empty | Open `/admin` and set it. |
| First user isn't admin | Someone else signed up first | Promote yourself by running the SQL in Part 4. |
| ngrok URL changed after restart | Quick tunnels rotate | Use a static domain (ngrok paid, cloudflared named tunnel, or Tailscale). |

---

## Part 8 — Quick start checklist

- [ ] Install LM Studio, load a model, click **Start Server**.
- [ ] Run `ngrok http 1234`. Copy the HTTPS URL.
- [ ] Tell the agent: *"Add secret `AI_BACKEND_URL` =
      `https://…ngrok-free.app/v1/chat/completions`"*.
- [ ] Open <https://dapaibackend.lovable.app>, sign up (you'll be admin).
- [ ] Go to `/admin`, set the system prompt, save.
- [ ] Send a test message — reply comes from your PC.
- [ ] Share the site. Promote anyone to Pro from `/admin`.

That's it. Have fun.
