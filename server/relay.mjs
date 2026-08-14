// Minimal standalone relay for DAP AI.
// Forwards OpenAI-style chat requests to a local AI server (LM Studio /
// Ollama / vLLM / etc.). Run on any always-on machine instead of the
// built-in /api/chat route.
//
//   AI_BACKEND_URL=http://localhost:1234/v1/chat/completions node server/relay.mjs
//
// Optional:
//   AI_BACKEND_KEY=sk-...          # bearer token for the upstream
//   PORT=8787                      # listen port
//   ALLOWED_ORIGIN=https://your.site  # CORS allow-origin (default: *)

import http from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const BACKEND = process.env.AI_BACKEND_URL;
const KEY = process.env.AI_BACKEND_KEY;
const ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

if (!BACKEND) {
  console.error("Set AI_BACKEND_URL to your local AI server (e.g. http://localhost:1234/v1/chat/completions)");
  process.exit(1);
}

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, cors);
    res.end("Method not allowed");
    return;
  }

  // Read body
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString("utf8");

  try {
    const upstream = await fetch(BACKEND, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
      },
      body,
    });
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    const content =
      payload?.choices?.[0]?.message?.content ?? payload?.message?.content;
    if (!upstream.ok || typeof content !== "string" || !content.trim()) {
      console.error(
        `Upstream returned ${upstream.status}: ${text.replace(/\s+/g, " ").trim().slice(0, 200)}`
      );
      res.writeHead(502, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Sorry, DAP AI is offline right now." }));
      return;
    }
    res.writeHead(upstream.status, {
      ...cors,
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify(payload));
  } catch (e) {
    res.writeHead(502, { ...cors, "Content-Type": "application/json" });
    console.error(`Upstream request failed: ${e.message}`);
    res.end(JSON.stringify({ error: "Sorry, DAP AI is offline right now." }));
  }
});

server.listen(PORT, () => {
  console.log(`DAP AI relay → ${BACKEND}`);
  console.log(`Listening on http://0.0.0.0:${PORT}`);
});
