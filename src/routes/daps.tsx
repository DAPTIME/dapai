import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { DAPS } from "@/lib/daps";
import { createChat } from "@/lib/chats.functions";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/daps")({
  head: () => ({
    meta: [
      { title: "DAPs — DAP AI" },
      {
        name: "description",
        content:
          "Custom AI helpers with their own system prompts stacked on top of DAP AI.",
      },
    ],
  }),
  component: Daps,
});

function Daps() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const create = useServerFn(createChat);

  const startDap = useMutation({
    mutationFn: (dapId: string) => create({ data: { dapId } }),
    onSuccess: (chat) =>
      navigate({ to: "/c/$threadId", params: { threadId: chat.id } }),
  });

  const launch = (id: string) => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    startDap.mutate(id);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">DAPs</h1>
        <p className="mt-2 text-muted-foreground">
          Specialized AI personas. Each DAP adds its own system prompt on top of
          the base DAP AI prompt.
        </p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {DAPS.map((g) => (
          <button
            key={g.id}
            onClick={() => launch(g.id)}
            disabled={startDap.isPending}
            className="group text-left rounded-2xl border border-border bg-card p-5 transition hover:border-ring/40 hover:shadow-[var(--shadow-soft)] disabled:opacity-60"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{g.emoji}</span>
              <h3 className="font-medium">{g.name}</h3>
              <Sparkles className="ml-auto h-4 w-4 text-primary opacity-0 transition group-hover:opacity-100" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{g.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
