# Use one LM Studio server for both AIs

You only need **one** LM Studio server and **one** ngrok tunnel. LM Studio can hold multiple models in memory at once and pick which one to use based on the `model` field in each request. The relay already sends that field per chat.

## Setup steps (LM Studio side)

1. Open LM Studio → **Developer** tab.
2. Load **both** models you want to use:
   - The bigger/smarter one → this will be **DAP AI 3.2** (Pro).
   - A smaller/faster one → this will be **DAP AI Lite**.
   Both appear in the loaded-models list at the top.
3. Click **Start Server** (one server, port `1234` by default).
4. Note the exact model identifiers LM Studio shows for each (e.g. `meta-llama-3.1-8b-instruct`, `qwen2.5-3b-instruct`). You'll paste these into the website.
5. Run **one** tunnel: `ngrok http 1234`. Copy the HTTPS URL.

## Setup steps (website side)

Currently the relay uses two separate URL secrets (`AI_BACKEND_URL_PRO` and `AI_BACKEND_URL_LITE`). With one LM Studio, they should both point at the same tunnel URL — but the relay also needs to translate the app's model names (`dap-ai-1.0`, `dap-ai-lite`) into the actual LM Studio model identifiers, otherwise LM Studio won't know which loaded model to use.

Plan:

1. **Secrets**: set/update three secrets via the agent:
   - `AI_BACKEND_URL_PRO` = `https://<your-ngrok>.ngrok-free.app/v1/chat/completions`
   - `AI_BACKEND_URL_LITE` = same URL as above
   - `AI_BACKEND_MODEL_PRO` = the LM Studio identifier of the big model (e.g. `meta-llama-3.1-8b-instruct`)
   - `AI_BACKEND_MODEL_LITE` = the LM Studio identifier of the small model (e.g. `qwen2.5-3b-instruct`)

2. **Update `src/routes/api/chat.ts`**: before forwarding, rewrite the `model` field in the request body from `dap-ai-1.0` → `process.env.AI_BACKEND_MODEL_PRO` and `dap-ai-lite` → `process.env.AI_BACKEND_MODEL_LITE`. Keep the existing per-model rate limit and queue logic (the queue key stays `dap-ai-1.0` / `dap-ai-lite` so each app-side model still gets its own slot).

3. **Update `src/lib/chats.functions.ts`**: if it sends requests directly (not through the relay), apply the same rename there. Otherwise leave it.

4. **Update `server/README.md`**: replace the "two tunnels" guidance for the multi-AI section with the "load both models in LM Studio, one tunnel, set `AI_BACKEND_MODEL_*` to the LM Studio model IDs" instructions.

That's it — admin per-model system prompts already work and don't need changes.

## Notes on running both models

- LM Studio loads both into VRAM at once. If they don't fit, lower the quant of one (Q4 instead of Q5/Q6), or pick a smaller Lite model (3B–4B is fine).
- LM Studio serializes requests per model, so the Pro queue and Lite queue still don't block each other on the GPU side — they just share VRAM.
- No second ngrok account, no second port, no second tunnel.

## Files touched

- `src/routes/api/chat.ts` — translate `model` field before forwarding.
- `src/lib/chats.functions.ts` — same translation if it bypasses the relay.
- `server/README.md` — rewrite the multi-AI section.
- Secrets (no code): `AI_BACKEND_URL_LITE`, `AI_BACKEND_MODEL_PRO`, `AI_BACKEND_MODEL_LITE`.
