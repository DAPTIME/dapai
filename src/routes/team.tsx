import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSiteConfig } from "@/lib/site-config";
import { useFeatureGuard } from "@/lib/feature-guard";
import { supabase } from "@/integrations/supabase/client";

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
  const siteConfig = useSiteConfig();
  const teamEnabled = siteConfig.flags.team;
  const teamEnabledOff = useFeatureGuard(teamEnabled ? null : "team");

  const betaQuery = useQuery({
    queryKey: ["beta-testers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beta_testers")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: teamEnabled,
  });

  if (teamEnabledOff) return null;
  if (!teamEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Team page temporarily disabled
        </h1>
        <p className="mt-3 text-muted-foreground">
          The team page is turned off right now. Please check back soon.
        </p>
      </div>
    );
  }


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
              <CardTitle className="text-lg">
                <h2 className="text-lg font-semibold leading-none tracking-tight">{s.title}</h2>
              </CardTitle>
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
