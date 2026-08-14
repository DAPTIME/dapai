/**
 * Reading and writing the player's DAP Track car.
 *
 * The plan check is duplicated: this refuses a write below Pro, and a
 * BEFORE UPDATE trigger on profiles.car refuses it again. The trigger is
 * the one that counts — the app writes through the caller's own key under
 * RLS, so a check that lives only here can be walked around by posting to
 * PostgREST directly. This copy exists to give a decent error message
 * rather than a raw Postgres one.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-error";
import { canEditCar, toCarSpec, DEFAULT_CAR, type CarSpec } from "@/lib/car-spec";
import type { Tier } from "@/lib/tier-rank";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours must look like #1a2b3c");

const carSchema = z.object({
  body: hex,
  trim: hex,
  glass: hex,
  hub: hex,
});

export const getMyCar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ car: CarSpec; tier: Tier; canEdit: boolean }> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("car, tier")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw dbError(error, "getMyCar");
    const tier = ((data?.tier as Tier) ?? "free");
    return { car: toCarSpec(data?.car), tier, canEdit: canEditCar(tier) };
  });

export const setMyCar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ car: carSchema }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("tier")
      .eq("id", context.userId)
      .maybeSingle();
    const tier = ((profile?.tier as Tier) ?? "free");
    if (!canEditCar(tier)) {
      throw new Error("Customising your car is a Pro feature.");
    }

    const car: CarSpec = {
      body: data.car.body.toLowerCase(),
      trim: data.car.trim.toLowerCase(),
      glass: data.car.glass.toLowerCase(),
      hub: data.car.hub.toLowerCase(),
    };
    const { error } = await context.supabase
      .from("profiles")
      .update({ car })
      .eq("id", context.userId);
    if (error) {
      // 42501: the trigger refused it. Its message is already user-facing.
      if (error.code === "42501") throw new Error(error.message);
      throw dbError(error, "setMyCar");
    }
    return { car };
  });

export const resetMyCar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ car: DEFAULT_CAR })
      .eq("id", context.userId);
    if (error) throw dbError(error, "resetMyCar");
    return { car: DEFAULT_CAR };
  });
