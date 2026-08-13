/**
 * Artifacts — when DAP AI answers with a runnable or renderable block
 * (a mini app/game in HTML, an SVG, a chart spec, or a quiz), we lift it out
 * of the transcript and render it live in a side panel.
 *
 * Detection is purely textual: fenced code blocks whose language tags us in.
 * Nothing here executes anything — the panel decides how to render.
 */
export type ArtifactKind = "app" | "svg" | "chart" | "quiz";

export type Artifact = {
  id: string;
  kind: ArtifactKind;
  title: string;
  code: string;
  messageId: string;
};

export type ChartSpec = {
  type?: "bar" | "line" | "area";
  title?: string;
  xKey?: string;
  series?: string[];
  data?: Array<Record<string, string | number>>;
};

export type QuizSpec = {
  title?: string;
  questions?: Array<{
    q: string;
    options: string[];
    /** index of the correct option */
    answer: number;
    explanation?: string;
  }>;
};

const FENCE = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;

function kindFor(lang: string, body: string): ArtifactKind | null {
  const l = lang.toLowerCase();
  if (l === "chart" || l === "chartjson") return "chart";
  if (l === "quiz" || l === "quizjson") return "quiz";
  if (l === "svg") return "svg";
  if (l === "html" || l === "htm") return "app";
  // An untagged block that is clearly a full document still counts.
  if (!l && /<!doctype html|<html[\s>]/i.test(body)) return "app";
  if (!l && /^\s*<svg[\s>]/i.test(body)) return "svg";
  return null;
}

function titleFor(kind: ArtifactKind, code: string): string {
  if (kind === "app") {
    const m = code.match(/<title>([^<]{1,60})<\/title>/i);
    if (m?.[1]) return m[1].trim();
    return "Mini app";
  }
  if (kind === "svg") return "Graphic";
  try {
    const parsed = JSON.parse(code) as { title?: string };
    if (parsed?.title) return String(parsed.title).slice(0, 60);
  } catch {
    /* fall through */
  }
  return kind === "chart" ? "Chart" : "Quiz";
}

/** Pull every renderable artifact out of one assistant message. */
export function extractArtifacts(messageId: string, content: string): Artifact[] {
  const out: Artifact[] = [];
  let match: RegExpExecArray | null;
  FENCE.lastIndex = 0;
  let i = 0;
  while ((match = FENCE.exec(content))) {
    const lang = match[1] ?? "";
    const body = (match[2] ?? "").trim();
    if (!body) continue;
    const kind = kindFor(lang, body);
    if (!kind) continue;
    out.push({
      id: `${messageId}-${i++}`,
      kind,
      title: titleFor(kind, body),
      code: body,
      messageId,
    });
  }
  return out;
}

export function parseChart(code: string): ChartSpec | null {
  try {
    const spec = JSON.parse(code) as ChartSpec;
    if (!Array.isArray(spec.data) || spec.data.length === 0) return null;
    return spec;
  } catch {
    return null;
  }
}

export function parseQuiz(code: string): QuizSpec | null {
  try {
    const spec = JSON.parse(code) as QuizSpec;
    if (!Array.isArray(spec.questions) || spec.questions.length === 0) return null;
    return spec;
  } catch {
    return null;
  }
}

/**
 * Wrap artifact code into a standalone document for the sandboxed iframe.
 * The iframe runs with `sandbox="allow-scripts"` and no same-origin access,
 * so the generated code can never reach the user's session.
 */
export function artifactDocument(a: Artifact): string {
  const base = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;padding:0;background:#0b0f17;color:#e6e9ef;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
  body{padding:12px}
  svg{max-width:100%;height:auto}
  canvas{max-width:100%}
</style>`;
  if (a.kind === "svg") return `${base}${a.code}`;
  if (/<html[\s>]/i.test(a.code) || /<!doctype/i.test(a.code)) return a.code;
  return `${base}${a.code}`;
}
