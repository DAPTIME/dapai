/**
 * Live artifact side panel. Renders whatever DAP AI produced — a mini app,
 * a graphic, a chart, or a quiz — beside the conversation. HTML runs inside a
 * sandboxed iframe with no same-origin access, so generated code can never
 * touch the user's session.
 */
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, Code2, Copy, PanelRightClose, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  artifactDocument,
  parseChart,
  parseQuiz,
  type Artifact,
} from "@/lib/artifacts";

const PALETTE = [
  "var(--primary)",
  "#8b5cf6",
  "#22d3ee",
  "#f59e0b",
  "#ef4444",
  "#10b981",
];

export function ArtifactPanel({
  artifacts,
  activeId,
  onSelect,
  onClose,
}: {
  artifacts: Artifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const active =
    artifacts.find((a) => a.id === activeId) ?? artifacts[artifacts.length - 1];
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!active) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-card/60">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-sm font-semibold">{active.title}</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {active.kind}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={showCode ? "Show preview" : "Show code"}
            onClick={() => setShowCode((s) => !s)}
          >
            <Code2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Copy artifact source"
            onClick={copy}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Close artifact panel"
            onClick={onClose}
          >
            <PanelRightClose className="hidden h-4 w-4 md:block" />
            <X className="h-4 w-4 md:hidden" />
          </Button>
        </div>
      </div>

      {artifacts.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
          {artifacts.map((a) => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition ${
                a.id === active.id
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {a.title}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {showCode ? (
          <pre className="overflow-auto p-3 text-xs leading-relaxed">
            <code>{active.code}</code>
          </pre>
        ) : (
          <ArtifactBody artifact={active} />
        )}
      </div>
    </aside>
  );
}

function ArtifactBody({ artifact }: { artifact: Artifact }) {
  if (artifact.kind === "chart") return <ChartArtifact code={artifact.code} />;
  if (artifact.kind === "quiz") return <QuizArtifact code={artifact.code} />;

  const doc = useMemoDoc(artifact);
  return (
    <iframe
      key={artifact.id}
      title={artifact.title}
      srcDoc={doc}
      sandbox="allow-scripts allow-pointer-lock"
      className="h-full min-h-[420px] w-full border-0 bg-[#0b0f17]"
    />
  );
}

function useMemoDoc(artifact: Artifact) {
  return useMemo(() => artifactDocument(artifact), [artifact]);
}

function ChartArtifact({ code }: { code: string }) {
  const spec = useMemo(() => parseChart(code), [code]);
  if (!spec) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        That chart data couldn&apos;t be read.
      </p>
    );
  }
  const data = spec.data ?? [];
  const xKey = spec.xKey ?? Object.keys(data[0] ?? { x: "" })[0]!;
  const series =
    spec.series && spec.series.length > 0
      ? spec.series
      : Object.keys(data[0] ?? {}).filter((k) => k !== xKey);

  const common = (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
      <XAxis dataKey={xKey} stroke="var(--muted-foreground)" fontSize={11} />
      <YAxis stroke="var(--muted-foreground)" fontSize={11} />
      <ChartTooltip
        contentStyle={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          fontSize: 12,
        }}
      />
    </>
  );

  return (
    <div className="p-3">
      {spec.title && <h3 className="mb-2 text-sm font-medium">{spec.title}</h3>}
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === "line" ? (
            <LineChart data={data}>
              {common}
              {series.map((s, i) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : spec.type === "area" ? (
            <AreaChart data={data}>
              {common}
              {series.map((s, i) => (
                <Area
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stroke={PALETTE[i % PALETTE.length]}
                  fill={PALETTE[i % PALETTE.length]}
                  fillOpacity={0.25}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={data}>
              {common}
              {series.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  fill={PALETTE[i % PALETTE.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function QuizArtifact({ code }: { code: string }) {
  const spec = useMemo(() => parseQuiz(code), [code]);
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (!spec) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        That quiz couldn&apos;t be read.
      </p>
    );
  }
  const questions = spec.questions ?? [];
  const answered = Object.keys(picked).length;
  const correct = questions.filter((q, i) => picked[i] === q.answer).length;

  return (
    <div className="space-y-4 p-3">
      {spec.title && <h3 className="text-sm font-medium">{spec.title}</h3>}
      {questions.map((q, qi) => (
        <div key={qi} className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-medium">
            {qi + 1}. {q.q}
          </p>
          <div className="mt-2 space-y-1.5">
            {q.options.map((opt, oi) => {
              const chosen = picked[qi] === oi;
              const reveal = picked[qi] !== undefined;
              const isRight = oi === q.answer;
              return (
                <button
                  key={oi}
                  onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                  className={`block w-full rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                    reveal && isRight
                      ? "border-primary bg-primary/10"
                      : chosen
                        ? "border-destructive/60 bg-destructive/10"
                        : "border-border hover:bg-accent"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {picked[qi] !== undefined && q.explanation && (
            <p className="mt-2 text-xs text-muted-foreground">{q.explanation}</p>
          )}
        </div>
      ))}
      {answered > 0 && (
        <p className="text-xs text-muted-foreground">
          {correct} / {questions.length} correct so far.
        </p>
      )}
    </div>
  );
}
