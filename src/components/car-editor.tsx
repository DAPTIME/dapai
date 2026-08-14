/**
 * The DAP Track garage: pick your car's colours.
 *
 * Pro and above. The gate here is the polite one — a trigger on
 * profiles.car refuses the write for anyone below Pro, so this only
 * decides what the page offers, never what the database accepts.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useUpgradeGate } from "@/lib/tier-gate";
import { getMyCar, setMyCar } from "@/lib/car.functions";
import {
  CAR_PRESETS,
  CAR_MIN_TIER,
  DEFAULT_CAR,
  type CarSpec,
} from "@/lib/car-spec";

const FIELDS: Array<{ key: keyof CarSpec; label: string }> = [
  { key: "body", label: "Body" },
  { key: "trim", label: "Trim" },
  { key: "glass", label: "Glass" },
  { key: "hub", label: "Wheels" },
];

/** A flat side-on car, so a colour change is visible without a 3D scene. */
function CarPreview({ spec }: { spec: CarSpec }) {
  return (
    <svg viewBox="0 0 200 78" className="h-[78px] w-[200px]" role="img" aria-label="Car preview">
      <path d="M14 56 L26 36 Q34 26 52 24 L118 20 Q146 19 168 33 L186 44 Q192 47 192 53 L192 58 L14 58 Z" fill={spec.body} />
      <path d="M58 30 L112 26 Q132 25 148 35 L104 37 Z" fill={spec.glass} />
      <rect x="10" y="58" width="182" height="6" rx="3" fill={spec.trim} />
      <path d="M168 20 L188 20 L188 30 L170 30 Z" fill={spec.trim} />
      {[58, 150].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={60} r={13} fill="#15191e" />
          <circle cx={cx} cy={60} r={5} fill={spec.hub} />
        </g>
      ))}
    </svg>
  );
}

export function CarEditor() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { requireTier } = useUpgradeGate();
  const fetchCar = useServerFn(getMyCar);
  const saveCar = useServerFn(setMyCar);

  const carQuery = useQuery({
    queryKey: ["my-car"],
    queryFn: () => fetchCar(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const [draft, setDraft] = useState<CarSpec>(DEFAULT_CAR);
  useEffect(() => {
    if (carQuery.data?.car) setDraft(carQuery.data.car);
  }, [carQuery.data?.car]);

  const canEdit = carQuery.data?.canEdit === true;
  const dirty =
    !!carQuery.data && FIELDS.some((f) => draft[f.key] !== carQuery.data!.car[f.key]);

  const save = useMutation({
    mutationFn: () => saveCar({ data: { car: draft } }),
    onSuccess: (res) => {
      queryClient.setQueryData(["my-car"], (old: unknown) =>
        old && typeof old === "object" ? { ...old, car: res.car } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["my-car"] });
      toast.success("Car saved. It'll show on your next run.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });

  if (!user) return null;

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">🎨 Your car</h2>
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? "Paint it how you like. It's yours on every track."
              : "Painting your car is a Pro feature."}
          </p>
        </div>
        {!canEdit && (
          <Button size="sm" variant="outline" onClick={() => requireTier(CAR_MIN_TIER, "Car customisation")}>
            Upgrade to Pro
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        <div className="rounded-lg border border-border bg-background/60 p-3">
          <CarPreview spec={draft} />
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`car-${f.key}`} className="text-xs">{f.label}</Label>
              <input
                id={`car-${f.key}`}
                type="color"
                value={draft[f.key]}
                disabled={!canEdit}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value.toLowerCase() }))}
                className="mt-1 h-9 w-full cursor-pointer rounded-md border border-border bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {CAR_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            disabled={!canEdit}
            onClick={() => setDraft(p.spec)}
            title={p.name}
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: p.spec.body }} />
            {p.name}
          </button>
        ))}

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!canEdit || !dirty}
            onClick={() => carQuery.data && setDraft(carQuery.data.car)}
          >
            Revert
          </Button>
          <Button size="sm" disabled={!canEdit || !dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save car"}
          </Button>
        </div>
      </div>
    </section>
  );
}
