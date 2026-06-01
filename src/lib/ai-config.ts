/**
 * AI config (system prompt, model) stored in localStorage. Lives in the
 * browser so each admin can tweak from their own machine; the system
 * prompt itself is forwarded to the server fn on every send.
 */
export interface AIConfig {
  systemPrompt: string;
}

const KEY = "lumen.ai.config";

export const defaultConfig: AIConfig = {
  systemPrompt: "You are DAP AI, a helpful and concise assistant.",
};

export function loadConfig(): AIConfig {
  if (typeof window === "undefined") return defaultConfig;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaultConfig, ...JSON.parse(raw) } : defaultConfig;
  } catch {
    return defaultConfig;
  }
}

export function saveConfig(cfg: AIConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(cfg));
}
