type ListedModel = {
  id: string;
  name: string;
};

function endpointFromChatUrl(chatUrl: string, pathname: string): string | undefined {
  try {
    const url = new URL(chatUrl);
    url.pathname = pathname;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

async function fetchJson(url: string, key?: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2_500);
  try {
    const res = await fetch(url, {
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) return undefined;
    return res.json() as Promise<unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function parseModelList(payload: unknown): ListedModel[] {
  const body = payload as {
    models?: Array<{ name?: string; model?: string }>;
    data?: Array<{ id?: string; name?: string }>;
  };

  const ollamaModels = Array.isArray(body.models)
    ? body.models
        .map((m) => m.name ?? m.model)
        .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
    : [];

  const openAiModels = Array.isArray(body.data)
    ? body.data
        .map((m) => m.id ?? m.name)
        .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
    : [];

  return [...ollamaModels, ...openAiModels].map((name) => ({ id: name, name }));
}

function pickBestModel(configuredModel: string, models: ListedModel[]): string | undefined {
  if (models.length === 0) return undefined;
  const configured = configuredModel.trim();
  const exact = models.find((m) => m.name === configured || m.id === configured);
  if (exact) return exact.name;

  const lowerConfigured = configured.toLowerCase();
  const familyHints = ["gemma", "llama", "qwen", "mistral", "phi"].filter((hint) =>
    lowerConfigured.includes(hint)
  );
  for (const hint of familyHints) {
    const match = models.find((m) => m.name.toLowerCase().includes(hint));
    if (match) return match.name;
  }

  return models[0].name;
}

export async function resolveOllamaModel(
  backend: string,
  key: string | undefined,
  configuredModel: string
): Promise<string> {
  const endpoints = [
    endpointFromChatUrl(backend, "/api/tags"),
    endpointFromChatUrl(backend, "/v1/models"),
  ].filter((url): url is string => Boolean(url));

  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJson(endpoint, key);
      const picked = pickBestModel(configuredModel, parseModelList(payload));
      if (picked) return picked;
    } catch {
      // Keep the configured value if the backend doesn't expose model listing.
    }
  }

  return configuredModel;
}