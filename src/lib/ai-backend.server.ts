/**
 * Shared resolver for the user's OWN AI backends (LM Studio / Ollama on
 * their Jetson hardware, exposed through a tunnel). This project never
 * hosts or runs models — it only points at the configured endpoints.
 */
import { resolveOllamaModel } from "@/lib/ollama-models.server";
import { modelInfo, type ModelId } from "@/lib/models";

export class AiBackendUnavailableError extends Error {
  constructor() {
    super("AI backend unavailable");
    this.name = "AiBackendUnavailableError";
  }
}

export function backendFor(model: ModelId): {
  url?: string;
  key?: string;
  upstreamModel: string;
} {
  if (model === "dap-ai-1.0") {
    return {
      url: process.env.AI_BACKEND_URL_PRO ?? process.env.AI_BACKEND_URL,
      key: process.env.AI_BACKEND_KEY_PRO ?? process.env.AI_BACKEND_KEY,
      upstreamModel: process.env.AI_BACKEND_MODEL_PRO ?? model,
    };
  }
  if (model === "dap-ai-pro-lite") {
    return {
      url:
        process.env.AI_BACKEND_URL_PRO_LITE ??
        process.env.AI_BACKEND_URL_LITE ??
        process.env.AI_BACKEND_URL,
      key:
        process.env.AI_BACKEND_KEY_PRO_LITE ??
        process.env.AI_BACKEND_KEY_LITE ??
        process.env.AI_BACKEND_KEY,
      upstreamModel:
        process.env.AI_BACKEND_MODEL_PRO_LITE ??
        process.env.AI_BACKEND_MODEL_LITE ??
        model,
    };
  }
  return {
    url: process.env.AI_BACKEND_URL_LITE ?? process.env.AI_BACKEND_URL,
    key: process.env.AI_BACKEND_KEY_LITE ?? process.env.AI_BACKEND_KEY,
    upstreamModel: process.env.AI_BACKEND_MODEL_LITE ?? model,
  };
}

/**
 * One-shot, non-streaming completion against the user's backend. Used for
 * short structured tasks (e.g. turning a chat into flashcards).
 */
export async function completeOnce(
  model: ModelId,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  opts: { timeoutMs?: number } = {}
): Promise<string> {
  const info = modelInfo(model);
  const { url, key, upstreamModel } = backendFor(model);
  if (!url) throw new AiBackendUnavailableError();

  let resolvedModel = upstreamModel;
  if (info?.lite) {
    try {
      const resolved = await resolveOllamaModel(url, key, upstreamModel);
      resolvedModel = resolved.model ?? upstreamModel;
    } catch {
      /* keep configured name */
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        stream: false,
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error(
        `[ai-backend] ${model} returned HTTP ${res.status}: ${raw.replace(/\s+/g, " ").trim().slice(0, 200)}`
      );
      throw new AiBackendUnavailableError();
    }
    try {
      const json = JSON.parse(raw) as {
        choices?: { message?: { content?: string } }[];
        message?: { content?: string };
        error?: string | { message?: string };
      };
      const content =
        json?.choices?.[0]?.message?.content ?? json?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        const providerError =
          typeof json.error === "string" ? json.error : json.error?.message;
        console.error(
          `[ai-backend] ${model} returned no reply: ${providerError?.slice(0, 200) ?? "empty response"}`
        );
        throw new AiBackendUnavailableError();
      }
      return content;
    } catch {
      console.error(
        `[ai-backend] ${model} returned non-JSON: ${raw.replace(/\s+/g, " ").trim().slice(0, 200)}`
      );
      throw new AiBackendUnavailableError();
    }
  } finally {
    clearTimeout(timer);
  }
}
