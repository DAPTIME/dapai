export interface AIConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  systemPrompt: string;
}

const KEY = "lumen.ai.config";

export const defaultConfig: AIConfig = {
  endpoint: "http://localhost:11434/v1/chat/completions",
  model: "llama3",
  apiKey: "",
  enabled: false,
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
