import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Our Team — DAP AI" },
      {
        name: "description",
        content:
          "Meet the team behind DAP AI — creator, AI designer, and beta testers.",
      },
    ],
    links: [{ rel: "canonical", href: "https://dapai.lovable.app/team" }],
  }),
  component: TeamPage,
});

const sections: { title: string; people: string[] }[] = [
  { title: "Website Creator", people: ["Devansh Pancholia"] },
  { title: "AI Designer", people: ["Devansh Pancholia"] },
  {
    title: "Beta Testers",
    people: [
      "Ishaan Jain",
      "Uzair Khan",
      "Abhay Dhakan",
      "Alexander Evershed",
      "Ibrahim Ali",
      "Mishika Sharma",
      "Shanjahanaa Murali",
    ],
  },
];

function TeamPage() {
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
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {s.people.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
