export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
}

export interface Thread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const KEY = "dap.threads.v1";

function safeRead(): Thread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Thread[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(threads: Thread[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(threads));
  window.dispatchEvent(new CustomEvent("dap:threads-changed"));
}

export function listThreads(): Thread[] {
  return safeRead().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getThread(id: string): Thread | undefined {
  return safeRead().find((t) => t.id === id);
}

export function createThread(): Thread {
  const t: Thread = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = safeRead();
  all.push(t);
  safeWrite(all);
  return t;
}

export function updateThread(id: string, patch: Partial<Omit<Thread, "id">>) {
  const all = safeRead();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch, updatedAt: Date.now() };
  safeWrite(all);
}

export function appendMessage(id: string, msg: ChatMessage) {
  const all = safeRead();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const t = all[idx];
  t.messages.push(msg);
  if (t.title === "New chat" && msg.role === "user") {
    t.title = msg.text.slice(0, 60);
  }
  t.updatedAt = Date.now();
  all[idx] = t;
  safeWrite(all);
}

export function deleteThread(id: string) {
  safeWrite(safeRead().filter((t) => t.id !== id));
}
