import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listBetaTesters } from "@/lib/beta.functions";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Our Team — DAP AI" },
      {
        name: "description",
        content:
          "Meet the team behind DAP AI — creator, AI designer, and beta testers.",
      },
      { property: "og:title", content: "Our Team — DAP AI" },
      {
        property: "og:description",
        content: "Meet the creator, AI designer, and beta testers behind DAP AI.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/team" },
    ],
    links: [{ rel: "canonical", href: "https://dapai.lovable.app/team" }],
  }),
  component: TeamPage,
});

function TeamPage() {
  const fetchBeta = useServerFn(listBetaTesters);
  const betaQuery = useQuery({
    queryKey: ["beta-testers"],
    queryFn: () => fetchBeta(),
  });

  const sections: { title: string; people: string[]; dynamic?: boolean }[] = [
    { title: "Website Creator", people: ["Devansh Pancholia"] },
    { title: "AI Designer", people: ["Devansh Pancholia"] },
    {
      title: "Beta Testers",
      people: (betaQuery.data ?? []).map((b) => b.name),
      dynamic: true,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Our Team</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The people who built and shaped DAP AI.
      </p>

      <div className="mt-8 space-y-4">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle className="text-lg">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {s.dynamic && betaQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : s.people.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one yet.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                  {s.people.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
